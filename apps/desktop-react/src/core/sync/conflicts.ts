import type { BookSemester, SyncCommand } from "@app/shared";

import { getBooksByIds } from "../db/repositories/books";
import { listRejectedOutboxRows, type OutboxRow } from "../db/repositories/outbox";
import { getSettingJson, saveSettingJson } from "../db/repositories/settings";
import { getStudentById } from "../db/repositories/students";
import type { SqlDatabase } from "../db/types";

const acknowledgedKey = "sync.acknowledged-conflict-ids";

export async function countUnacknowledgedSyncConflicts(database: SqlDatabase) {
  const [rows, acknowledged] = await Promise.all([
    listRejectedOutboxRows(database),
    getSettingJson<string[]>(database, acknowledgedKey, []),
  ]);
  const acknowledgedIds = new Set(acknowledged);
  return rows.filter(({ id }) => !acknowledgedIds.has(id)).length;
}

export type SyncConflict = {
  commandId: string;
  row: OutboxRow;
  command: SyncCommand | null;
  isInsufficientStock: boolean;
  studentName: string | null;
  bookNames: string[];
  bookSelections?: Array<{ bookName: string; semester: BookSemester }>;
  acknowledged: boolean;
};

export async function listSyncConflicts(database: SqlDatabase): Promise<SyncConflict[]> {
  const [rows, acknowledged] = await Promise.all([
    listRejectedOutboxRows(database),
    getSettingJson<string[]>(database, acknowledgedKey, []),
  ]);
  const acknowledgedIds = new Set(acknowledged);

  return Promise.all(rows.map(async (row) => {
    const command = parseCommand(row.payloadJson);
    const isInsufficientStock = row.lastError?.startsWith("INSUFFICIENT_STOCK") ?? false;
    const issue = isInsufficientStock && command?.type === "ISSUE_BOOKS_TO_STUDENT"
      ? command
      : null;
    const [student, books] = issue
      ? await Promise.all([
          getStudentById(database, issue.studentId),
          getBooksByIds(database, issue.bookSelections.map(({ bookId }) => bookId)),
        ])
      : [null, []];

    return {
      commandId: row.id,
      row,
      command,
      isInsufficientStock,
      studentName: student?.name ?? null,
      bookNames: books.map(({ name }) => name),
      bookSelections: issue?.bookSelections.map((selection) => ({
        bookName: books.find(({ id }) => id === selection.bookId)?.name ?? "Unknown book",
        semester: selection.semester,
      })) ?? [],
      acknowledged: acknowledgedIds.has(row.id),
    };
  }));
}

export async function acknowledgeSyncConflict(
  database: SqlDatabase,
  conflictId: string,
  updatedAt: string,
) {
  const ids = new Set(
    await getSettingJson<string[]>(database, acknowledgedKey, []),
  );
  ids.add(conflictId);
  await saveSettingJson(database, acknowledgedKey, [...ids].sort(), updatedAt);
}

function parseCommand(payloadJson: string): SyncCommand | null {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    return typeof parsed?.type === "string" ? parsed as SyncCommand : null;
  } catch {
    return null;
  }
}
