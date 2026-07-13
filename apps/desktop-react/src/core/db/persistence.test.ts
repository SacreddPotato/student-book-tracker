import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestSqliteDatabase } from "./test-database";
import { runMigrations } from "./migrations";
import { requiredIndexNames, requiredTableNames } from "./schema";
import {
  createInitialAcademicYear,
  getCurrentAcademicYear,
  listAcademicYears,
} from "./repositories/academic-years";
import { listBooks, upsertBook } from "./repositories/books";
import { listPendingOutboxRows } from "./repositories/outbox";
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

const fixedNow = "2026-07-08T10:00:00.000Z";

describe("React desktop SQLite persistence", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
  });

  afterEach(() => database.close());

  it("creates every canonical local table and index idempotently", async () => {
    await runMigrations(database);

    const tables = await database.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const indexes = await database.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );

    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([...requiredTableNames]),
    );
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([...requiredIndexNames]),
    );
    expect(
      await database.select<{ count: number }>(
        "SELECT COUNT(*) AS count FROM local_schema_migrations",
      ),
    ).toEqual([{ count: 4 }]);
  });

  it("persists academic years, yearly students, and both semester balances", async () => {
    await createInitialAcademicYear(database, "2025-2026", fixedNow);
    await upsertStudent(database, {
      id: "student-1",
      scopeId: "global",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
      academicYear: "2025-2026",
      previousStudentId: null,
      createdAt: fixedNow,
      updatedAt: fixedNow,
      deletedAt: null,
    });
    await upsertBook(database, {
      id: "book-1",
      scopeId: "global",
      name: "Primary Math",
      educationStage: "primary",
      gradeLevel: "primary1",
      firstSemesterQuantity: 12,
      secondSemesterQuantity: 7,
      createdAt: fixedNow,
      updatedAt: fixedNow,
      deletedAt: null,
    });

    expect(await listAcademicYears(database)).toEqual([
      expect.objectContaining({ academicYear: "2025-2026", status: "current" }),
    ]);
    expect(await getCurrentAcademicYear(database)).toEqual(
      expect.objectContaining({ academicYear: "2025-2026" }),
    );
    expect(await listStudents(database, "2025-2026")).toEqual([
      expect.objectContaining({
        id: "student-1",
        gradeLevel: "primary1",
        academicYear: "2025-2026",
      }),
    ]);
    expect(await listBooks(database)).toEqual([
      expect.objectContaining({
        id: "book-1",
        firstSemesterQuantity: 12,
        secondSemesterQuantity: 7,
      }),
    ]);
    expect(await listPendingOutboxRows(database)).toEqual([]);
  });

  it("persists sync cursors and JSON settings", async () => {
    await saveSyncState(database, {
      id: "global",
      pullCursor: "42",
      lastSyncedAt: fixedNow,
      lastError: null,
    });
    await saveSettingJson(database, "acknowledged", ["command-1"], fixedNow);

    expect(await getSyncState(database)).toEqual({
      id: "global",
      pullCursor: "42",
      lastSyncedAt: fixedNow,
      lastError: null,
    });
    expect(await getSettingJson<string[]>(database, "acknowledged", [])).toEqual([
      "command-1",
    ]);
  });

  it("persists year, semester, and receipt data on inventory records", async () => {
    await createInventoryTransaction(database, {
      id: "transaction-1", scopeId: "global", academicYear: "2025-2026",
      type: "stock_increase", studentId: null, receiptNumber: "00041",
      receiptDate: "2026-01-14", reversedTransactionId: null,
      reversedByTransactionId: null, deviceId: "device-1", commandId: "command-1",
      occurredAt: fixedNow, createdAt: fixedNow,
    }, [{
      id: "item-1", transactionId: "transaction-1", bookId: "book-1",
      semester: "second", quantityDelta: 3, quantityAfter: 3, createdAt: fixedNow,
    }]);
    await createStudentBookRows(database, [{
      id: "issued-1", scopeId: "global", academicYear: "2025-2026",
      studentId: "student-1", bookId: "book-1", semester: "first",
      issuedTransactionId: "transaction-1", createdAt: fixedNow, reversedAt: null,
    }]);

    expect(await listInventoryTransactions(database, "2025-2026")).toEqual([
      expect.objectContaining({ receiptNumber: "00041", receiptDate: "2026-01-14" }),
    ]);
    expect(await listInventoryTransactionItems(database, "transaction-1")).toEqual([
      expect.objectContaining({ semester: "second", quantityAfter: 3 }),
    ]);
    expect(await listActiveStudentBookRows(database, "2025-2026", "student-1")).toEqual([
      expect.objectContaining({ semester: "first", academicYear: "2025-2026" }),
    ]);
    expect(await listInventoryTransactions(database, "2026-2027")).toEqual([]);
  });
});
