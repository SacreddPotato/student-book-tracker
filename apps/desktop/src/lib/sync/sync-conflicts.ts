import type { SqlDatabase } from "$lib/db/local-db";
import { getBooksByIds } from "$lib/db/repositories/books";
import { listRejectedOutboxRows, type OutboxRow } from "$lib/db/repositories/outbox";
import { getStudentById } from "$lib/db/repositories/students";
import type { LegacySyncCommand } from "./legacy-sync-command";

const acknowledgedConflictSettingKey = "sync.acknowledged-conflict-ids";

export type SyncConflict = {
  row: OutboxRow;
  command: LegacySyncCommand | null;
  isInsufficientStock: boolean;
  studentName: string | null;
  bookNames: string[];
  acknowledged: boolean;
};

export async function listSyncConflicts(database: SqlDatabase): Promise<SyncConflict[]> {
  const [rows, acknowledgedIds] = await Promise.all([
    listRejectedOutboxRows(database),
    getAcknowledgedConflictIds(database),
  ]);

  return Promise.all(
    rows.map(async (row) => {
      const command = parseCommand(row.payloadJson);
      const isInsufficientStock = row.lastError?.startsWith("INSUFFICIENT_STOCK") ?? false;
      const issueCommand =
        isInsufficientStock && command?.type === "ISSUE_BOOKS_TO_STUDENT" ? command : null;
      const [student, books] = issueCommand
        ? await Promise.all([
            getStudentById(database, issueCommand.studentId),
            getBooksByIds(database, issueCommand.bookIds),
          ])
        : [null, []];

      return {
        row,
        command,
        isInsufficientStock,
        studentName: student?.name ?? null,
        bookNames: books.map((book) => book.name),
        acknowledged: acknowledgedIds.has(row.id),
      };
    }),
  );
}

export async function acknowledgeSyncConflict(
  database: SqlDatabase,
  conflictId: string,
  updatedAt: string,
): Promise<void> {
  const acknowledgedIds = await getAcknowledgedConflictIds(database);
  acknowledgedIds.add(conflictId);

  await database.execute(
    `INSERT INTO app_settings (key, value_json, updated_at)
    VALUES ($1, $2, $3)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at`,
    [
      acknowledgedConflictSettingKey,
      JSON.stringify([...acknowledgedIds].sort()),
      updatedAt,
    ],
  );
}

async function getAcknowledgedConflictIds(database: SqlDatabase): Promise<Set<string>> {
  const rows = await database.select<{ valueJson: string }>(
    "SELECT value_json AS valueJson FROM app_settings WHERE key = $1",
    [acknowledgedConflictSettingKey],
  );
  const valueJson = rows[0]?.valueJson;

  if (!valueJson) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(valueJson);
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function parseCommand(payloadJson: string): LegacySyncCommand | null {
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object" && "type" in parsed
      ? (parsed as LegacySyncCommand)
      : null;
  } catch {
    return null;
  }
}
