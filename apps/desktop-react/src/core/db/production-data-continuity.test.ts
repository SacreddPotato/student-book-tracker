import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runMigrations } from "./migrations";
import { listBooks, upsertBook } from "./repositories/books";
import { enqueueOutboxCommand, listRejectedOutboxRows } from "./repositories/outbox";
import { getSettingJson, saveSettingJson } from "./repositories/settings";
import { listStudents, upsertStudent } from "./repositories/students";
import { getSyncState, saveSyncState } from "./repositories/sync-state";
import {
  createInventoryTransaction,
  createStudentBookRows,
  listActiveStudentBookRows,
  listInventoryTransactionItems,
  listInventoryTransactions,
} from "./repositories/transactions";
import { TestSqliteDatabase } from "./test-database";

const now = "2026-07-10T12:00:00.000Z";

describe("production database continuity", () => {
  it("opens a copied representative database without changing canonical data", async () => {
    const directory = mkdtempSync(join(tmpdir(), "student-book-react-continuity-"));
    const legacyPath = join(directory, "legacy-student-book-tracker.db");
    const productionPath = join(directory, "student-book-tracker.db");
    try {
      const legacy = new TestSqliteDatabase(legacyPath);
      const legacySchemaSource = readFileSync(
        join(process.cwd(), "../desktop/src/lib/db/schema.ts"),
        "utf8",
      );
      const legacyStatements = [...legacySchemaSource.matchAll(/`([\s\S]*?)`/g)]
        .map((match) => match[1].trim())
        .filter((statement) => /^CREATE (?:TABLE|UNIQUE INDEX)/.test(statement));
      expect(legacyStatements).toHaveLength(10);
      await legacy.execute(`CREATE TABLE local_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`);
      for (const statement of legacyStatements) await legacy.execute(statement);
      await legacy.execute(
        "INSERT INTO local_schema_migrations (id, applied_at) VALUES ($1, $2)",
        ["001_initial_local_schema", now],
      );
      await upsertStudent(legacy, { id: "student-1", scopeId: "global", name: "Mona Ahmed", governmentId: "29801011234567", educationStage: "primary", gradeLevel: "primary1", createdAt: now, updatedAt: now, deletedAt: null });
      await upsertBook(legacy, { id: "book-1", scopeId: "global", name: "Primary Math", educationStage: "primary", quantity: 4, createdAt: now, updatedAt: now, deletedAt: null });
      await createInventoryTransaction(legacy, { id: "tx-1", scopeId: "global", type: "student_issue", studentId: "student-1", reversedTransactionId: null, reversedByTransactionId: null, deviceId: "legacy", commandId: "command-1", occurredAt: now, createdAt: now }, [{ id: "item-1", transactionId: "tx-1", bookId: "book-1", quantityDelta: -1, quantityAfter: 4, createdAt: now }]);
      await createStudentBookRows(legacy, [{ id: "student-book-1", scopeId: "global", studentId: "student-1", bookId: "book-1", issuedTransactionId: "tx-1", createdAt: now, reversedAt: null }]);
      await enqueueOutboxCommand(legacy, { id: "rejected-1", commandType: "ISSUE_BOOKS_TO_STUDENT", payloadJson: "{}", status: "rejected", attempts: 1, lastError: "INSUFFICIENT_STOCK", createdAt: now, updatedAt: now });
      await saveSyncState(legacy, { id: "global", pullCursor: "19", lastSyncedAt: now, lastError: null });
      await saveSettingJson(legacy, "language", "ar", now);
      legacy.close();

      copyFileSync(legacyPath, productionPath);
      const reactProduction = new TestSqliteDatabase(productionPath);
      await runMigrations(reactProduction);

      expect(await listStudents(reactProduction)).toEqual([expect.objectContaining({ id: "student-1", name: "Mona Ahmed", gradeLevel: "primary1" })]);
      expect(await listBooks(reactProduction)).toEqual([expect.objectContaining({ id: "book-1", quantity: 4 })]);
      expect(await listInventoryTransactions(reactProduction)).toEqual([expect.objectContaining({ id: "tx-1", commandId: "command-1" })]);
      expect(await listInventoryTransactionItems(reactProduction, "tx-1")).toEqual([expect.objectContaining({ quantityDelta: -1, quantityAfter: 4 })]);
      expect(await listActiveStudentBookRows(reactProduction, "student-1")).toEqual([expect.objectContaining({ bookId: "book-1" })]);
      expect(await listRejectedOutboxRows(reactProduction)).toEqual([expect.objectContaining({ id: "rejected-1", status: "rejected" })]);
      expect(await getSyncState(reactProduction)).toEqual(expect.objectContaining({ pullCursor: "19", lastSyncedAt: now }));
      expect(await getSettingJson(reactProduction, "language", "en")).toBe("ar");
      reactProduction.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
