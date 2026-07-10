import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import { runMigrations } from "../db/migrations";
import { upsertBook } from "../db/repositories/books";
import {
  enqueueOutboxCommand,
  listRejectedOutboxRows,
} from "../db/repositories/outbox";
import { upsertStudent } from "../db/repositories/students";
import { acknowledgeSyncConflict, listSyncConflicts } from "./conflicts";

const now = "2026-07-08T10:00:00.000Z";

describe("sync conflicts", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
    await upsertStudent(database, {
      id: "student-1", scopeId: "global", name: "Mona Ahmed",
      governmentId: "29801011234567", educationStage: "primary",
      gradeLevel: "primary1", createdAt: now, updatedAt: now, deletedAt: null,
    });
    await upsertBook(database, {
      id: "book-1", scopeId: "global", name: "Primary Math",
      educationStage: "primary", quantity: 0, createdAt: now,
      updatedAt: now, deletedAt: null,
    });
    await enqueueOutboxCommand(database, {
      id: "command-1",
      commandType: "ISSUE_BOOKS_TO_STUDENT",
      payloadJson: JSON.stringify({
        id: "command-1", type: "ISSUE_BOOKS_TO_STUDENT", deviceId: "device-1",
        occurredAt: now, studentId: "student-1", bookIds: ["book-1"],
      }),
      status: "rejected", attempts: 1,
      lastError: "INSUFFICIENT_STOCK: Not enough stock.",
      createdAt: now, updatedAt: now,
    });
  });

  afterEach(() => database.close());

  it("resolves student and book names for insufficient stock", async () => {
    expect(await listSyncConflicts(database)).toEqual([
      expect.objectContaining({
        commandId: "command-1",
        studentName: "Mona Ahmed",
        bookNames: ["Primary Math"],
        isInsufficientStock: true,
        acknowledged: false,
      }),
    ]);
  });

  it("acknowledges without deleting the rejected audit row", async () => {
    await acknowledgeSyncConflict(database, "command-1", now);

    expect(await listRejectedOutboxRows(database)).toHaveLength(1);
    expect(await listSyncConflicts(database)).toEqual([
      expect.objectContaining({ commandId: "command-1", acknowledged: true }),
    ]);
  });
});
