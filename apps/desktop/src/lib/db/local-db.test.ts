import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase, SqlValue } from "./local-db";
import { runMigrations } from "./migrations";
import { requiredIndexNames, requiredTableNames } from "./schema";
import { listBooks, upsertBook } from "./repositories/books";
import {
  createInventoryTransaction,
  listInventoryTransactionItems,
  listInventoryTransactions,
} from "./repositories/transactions";
import { enqueueOutboxCommand, listPendingOutboxRows, updateOutboxStatus } from "./repositories/outbox";
import { listStudents, upsertStudent } from "./repositories/students";

class TestSqliteDatabase implements SqlDatabase {
  readonly db = new DatabaseSync(":memory:");

  async execute(sql: string, values: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(toSqliteBindings(values));
  }

  async select<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(toSqliteBindings(values)) as T[];
  }

  close(): void {
    this.db.close();
  }
}

function toSqliteBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}

describe("local SQLite persistence", () => {
  let database: TestSqliteDatabase;

  beforeEach(() => {
    database = new TestSqliteDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it("creates every required shared and local-only table and index", async () => {
    await runMigrations(database);

    const tables = await database.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const indexes = await database.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );

    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining([...requiredTableNames]));
    expect(indexes.map(({ name }) => name)).toEqual(expect.arrayContaining([...requiredIndexNames]));
  });

  it("can run migrations more than once without recreating schema", async () => {
    await runMigrations(database);
    await runMigrations(database);

    const appliedMigrations = await database.select<{ count: number }>(
      "SELECT COUNT(*) AS count FROM local_schema_migrations",
    );

    expect(appliedMigrations[0]?.count).toBeGreaterThan(0);
  });

  it("upserts and lists students", async () => {
    await runMigrations(database);

    await upsertStudent(database, {
      id: "student-1",
      scopeId: "global",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
      createdAt: "2026-07-08T10:00:00.000Z",
      updatedAt: "2026-07-08T10:00:00.000Z",
      deletedAt: null,
    });

    expect(await listStudents(database)).toEqual([
      expect.objectContaining({
        id: "student-1",
        name: "Mona Ahmed",
        governmentId: "29801011234567",
        educationStage: "primary",
        gradeLevel: "primary1",
      }),
    ]);
  });

  it("upserts and lists books", async () => {
    await runMigrations(database);

    await upsertBook(database, {
      id: "book-1",
      scopeId: "global",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 12,
      createdAt: "2026-07-08T10:00:00.000Z",
      updatedAt: "2026-07-08T10:00:00.000Z",
      deletedAt: null,
    });

    expect(await listBooks(database)).toEqual([
      expect.objectContaining({
        id: "book-1",
        name: "Primary Math",
        educationStage: "primary",
        quantity: 12,
      }),
    ]);
  });

  it("creates inventory transactions with items", async () => {
    await runMigrations(database);

    await createInventoryTransaction(
      database,
      {
        id: "transaction-1",
        scopeId: "global",
        type: "stock_increase",
        studentId: null,
        reversedTransactionId: null,
        reversedByTransactionId: null,
        deviceId: "device-1",
        commandId: "command-1",
        occurredAt: "2026-07-08T10:00:00.000Z",
        createdAt: "2026-07-08T10:00:00.000Z",
      },
      [
        {
          id: "item-1",
          transactionId: "transaction-1",
          bookId: "book-1",
          quantityDelta: 5,
          quantityAfter: 5,
          createdAt: "2026-07-08T10:00:00.000Z",
        },
      ],
    );

    expect(await listInventoryTransactions(database)).toEqual([
      expect.objectContaining({ id: "transaction-1", commandId: "command-1" }),
    ]);
    expect(await listInventoryTransactionItems(database, "transaction-1")).toEqual([
      expect.objectContaining({ id: "item-1", quantityDelta: 5, quantityAfter: 5 }),
    ]);
  });

  it("enqueues and updates outbox rows", async () => {
    await runMigrations(database);

    await enqueueOutboxCommand(database, {
      id: "outbox-1",
      commandType: "UPSERT_STUDENT",
      payloadJson: JSON.stringify({ id: "command-1" }),
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: "2026-07-08T10:00:00.000Z",
      updatedAt: "2026-07-08T10:00:00.000Z",
    });

    expect(await listPendingOutboxRows(database)).toHaveLength(1);

    await updateOutboxStatus(database, {
      id: "outbox-1",
      status: "synced",
      lastError: null,
      updatedAt: "2026-07-08T10:05:00.000Z",
    });

    expect(await listPendingOutboxRows(database)).toHaveLength(0);
  });
});
