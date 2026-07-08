import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import type { SqlDatabase, SqlValue } from "../db/local-db";
import { runMigrations } from "../db/migrations";
import { listBooks, upsertBook } from "../db/repositories/books";
import { listPendingOutboxRows } from "../db/repositories/outbox";
import { upsertStudent } from "../db/repositories/students";
import {
  listInventoryTransactionItems,
  listInventoryTransactions,
} from "../db/repositories/transactions";
import {
  addBookStock,
  issueBooksToStudent,
  reverseTransaction,
  type InventoryServiceContext,
} from "./inventory-service";

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

const fixedNow = "2026-07-08T10:00:00.000Z";

function createContext(database: SqlDatabase, ids: string[]): InventoryServiceContext {
  let index = 0;

  return {
    database,
    deviceId: "device-1",
    now: () => fixedNow,
    createId: () => {
      const id = ids[index];
      index += 1;

      if (!id) {
        throw new Error("Test ran out of deterministic IDs.");
      }

      return id;
    },
  };
}

async function seedBook(database: SqlDatabase, id: string, quantity: number): Promise<void> {
  await upsertBook(database, {
    id,
    scopeId: "global",
    name: `${id} name`,
    educationStage: "primary",
    quantity,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  });
}

async function seedStudent(database: SqlDatabase, id = "student-1"): Promise<void> {
  await upsertStudent(database, {
    id,
    scopeId: "global",
    name: "Mona Ahmed",
    governmentId: "29801011234567",
    educationStage: "primary",
    gradeLevel: "primary1",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  });
}

describe("inventory service", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = new TestSqliteDatabase();
    await runMigrations(database);
  });

  afterEach(() => {
    database.close();
  });

  it("adds book stock with an inventory transaction, updated quantity, and outbox command", async () => {
    await seedBook(database, "book-1", 2);
    const context = createContext(database, ["command-1", "transaction-1", "item-1"]);

    const transaction = await addBookStock({ bookId: "book-1", quantity: 5 }, context);

    expect(transaction.id).toBe("transaction-1");
    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-1", quantity: 7 }),
    ]);
    expect(await listInventoryTransactions(database)).toEqual([
      expect.objectContaining({
        id: "transaction-1",
        type: "stock_increase",
        commandId: "command-1",
      }),
    ]);
    expect(await listInventoryTransactionItems(database, "transaction-1")).toEqual([
      expect.objectContaining({
        id: "item-1",
        bookId: "book-1",
        quantityDelta: 5,
        quantityAfter: 7,
      }),
    ]);

    const outboxRows = await listPendingOutboxRows(database);
    expect(outboxRows).toEqual([expect.objectContaining({ id: "command-1" })]);
    expect(JSON.parse(outboxRows[0]?.payloadJson ?? "{}")).toEqual({
      id: "command-1",
      type: "ADD_BOOK_STOCK",
      deviceId: "device-1",
      occurredAt: fixedNow,
      bookId: "book-1",
      quantity: 5,
    });
  });

  it("issues books to a student, decrements quantities, records issued books, and enqueues sync", async () => {
    await seedStudent(database);
    await seedBook(database, "book-1", 2);
    await seedBook(database, "book-2", 1);
    const context = createContext(database, [
      "command-1",
      "transaction-1",
      "item-1",
      "student-book-1",
      "item-2",
      "student-book-2",
    ]);

    const transaction = await issueBooksToStudent(
      { studentId: "student-1", bookIds: ["book-1", "book-2"] },
      context,
    );

    expect(transaction.id).toBe("transaction-1");
    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-1", quantity: 1 }),
      expect.objectContaining({ id: "book-2", quantity: 0 }),
    ]);
    expect(await listInventoryTransactionItems(database, "transaction-1")).toEqual([
      expect.objectContaining({ id: "item-1", bookId: "book-1", quantityDelta: -1, quantityAfter: 1 }),
      expect.objectContaining({ id: "item-2", bookId: "book-2", quantityDelta: -1, quantityAfter: 0 }),
    ]);

    const issuedRows = await database.select<{
      id: string;
      studentId: string;
      bookId: string;
      issuedTransactionId: string;
      reversedAt: string | null;
    }>(
      `SELECT
        id,
        student_id AS studentId,
        book_id AS bookId,
        issued_transaction_id AS issuedTransactionId,
        reversed_at AS reversedAt
      FROM student_books
      ORDER BY id`,
    );
    expect(issuedRows).toEqual([
      {
        id: "student-book-1",
        studentId: "student-1",
        bookId: "book-1",
        issuedTransactionId: "transaction-1",
        reversedAt: null,
      },
      {
        id: "student-book-2",
        studentId: "student-1",
        bookId: "book-2",
        issuedTransactionId: "transaction-1",
        reversedAt: null,
      },
    ]);

    const outboxRows = await listPendingOutboxRows(database);
    expect(JSON.parse(outboxRows[0]?.payloadJson ?? "{}")).toEqual({
      id: "command-1",
      type: "ISSUE_BOOKS_TO_STUDENT",
      deviceId: "device-1",
      occurredAt: fixedNow,
      studentId: "student-1",
      bookIds: ["book-1", "book-2"],
    });
  });

  it("fails locally without modifying stock when any issued book has zero stock", async () => {
    await seedStudent(database);
    await seedBook(database, "book-available", 2);
    await seedBook(database, "book-empty", 0);
    const context = createContext(database, ["command-1", "transaction-1"]);

    await expect(
      issueBooksToStudent(
        { studentId: "student-1", bookIds: ["book-available", "book-empty"] },
        context,
      ),
    ).rejects.toThrow("Cannot issue books with zero stock: book-empty");

    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-available", quantity: 2 }),
      expect.objectContaining({ id: "book-empty", quantity: 0 }),
    ]);
    expect(await listInventoryTransactions(database)).toEqual([]);
    expect(await listPendingOutboxRows(database)).toEqual([]);
  });

  it("reverses a student issue once by creating an inverse transaction and restoring stock", async () => {
    await seedStudent(database);
    await seedBook(database, "book-1", 1);
    const issueContext = createContext(database, [
      "issue-command",
      "issue-transaction",
      "issue-item",
      "student-book-1",
    ]);
    await issueBooksToStudent({ studentId: "student-1", bookIds: ["book-1"] }, issueContext);

    const reverseContext = createContext(database, [
      "reverse-command",
      "reverse-transaction",
      "reverse-item",
    ]);
    const reversal = await reverseTransaction({ transactionId: "issue-transaction" }, reverseContext);

    expect(reversal.id).toBe("reverse-transaction");
    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-1", quantity: 1 }),
    ]);
    expect(await listInventoryTransactions(database)).toEqual([
      expect.objectContaining({
        id: "reverse-transaction",
        type: "reversal",
        reversedTransactionId: "issue-transaction",
        commandId: "reverse-command",
      }),
      expect.objectContaining({
        id: "issue-transaction",
        reversedByTransactionId: "reverse-transaction",
      }),
    ]);
    expect(await listInventoryTransactionItems(database, "reverse-transaction")).toEqual([
      expect.objectContaining({
        id: "reverse-item",
        bookId: "book-1",
        quantityDelta: 1,
        quantityAfter: 1,
      }),
    ]);
    expect(await database.select<{ reversedAt: string | null }>("SELECT reversed_at AS reversedAt FROM student_books")).toEqual([
      { reversedAt: fixedNow },
    ]);

    const outboxRows = await listPendingOutboxRows(database);
    expect(JSON.parse(outboxRows[1]?.payloadJson ?? "{}")).toEqual({
      id: "reverse-command",
      type: "REVERSE_TRANSACTION",
      deviceId: "device-1",
      occurredAt: fixedNow,
      transactionId: "issue-transaction",
    });
  });

  it("fails locally when reversing the same transaction twice", async () => {
    await seedBook(database, "book-1", 2);
    await addBookStock(
      { bookId: "book-1", quantity: 3 },
      createContext(database, ["stock-command", "stock-transaction", "stock-item"]),
    );
    await reverseTransaction(
      { transactionId: "stock-transaction" },
      createContext(database, ["reverse-command", "reverse-transaction", "reverse-item"]),
    );

    await expect(
      reverseTransaction(
        { transactionId: "stock-transaction" },
        createContext(database, ["second-reverse-command", "second-reverse-transaction"]),
      ),
    ).rejects.toThrow("Transaction has already been reversed: stock-transaction");

    expect(await listInventoryTransactions(database)).toHaveLength(2);
    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-1", quantity: 2 }),
    ]);
  });
});
