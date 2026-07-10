import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import { runMigrations } from "../db/migrations";
import { getBookById, upsertBook } from "../db/repositories/books";
import { listPendingOutboxRows } from "../db/repositories/outbox";
import { upsertStudent } from "../db/repositories/students";
import {
  listActiveStudentBookRows,
  listInventoryTransactions,
} from "../db/repositories/transactions";
import {
  addBookStock,
  issueBooksToStudent,
  reverseTransaction,
  type InventoryServiceContext,
} from "./inventory-service";

const fixedNow = "2026-07-08T10:00:00.000Z";

function context(database: TestSqliteDatabase, ids: string[]): InventoryServiceContext {
  let index = 0;
  return {
    database,
    deviceId: "device-1",
    now: () => fixedNow,
    createId: () => ids[index++] ?? (() => { throw new Error("Missing test ID"); })(),
  };
}

async function seedStudent(
  database: TestSqliteDatabase,
  stage: "primary" | "preparatory" = "primary",
) {
  await upsertStudent(database, {
    id: "student-1",
    scopeId: "global",
    name: "Mona Ahmed",
    governmentId: "29801011234567",
    educationStage: stage,
    gradeLevel: stage === "primary" ? "primary1" : "preparatory1",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  });
}

async function seedBook(
  database: TestSqliteDatabase,
  id: string,
  quantity: number,
  stage: "primary" | "preparatory" = "primary",
) {
  await upsertBook(database, {
    id,
    scopeId: "global",
    name: `${id} name`,
    educationStage: stage,
    quantity,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  });
}

describe("React inventory service", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
  });

  afterEach(() => database.close());

  it("adds stock atomically and enqueues its command", async () => {
    await seedBook(database, "book-1", 2);

    await addBookStock(
      { bookId: "book-1", quantity: 5 },
      context(database, ["command-1", "transaction-1", "item-1"]),
    );

    expect((await getBookById(database, "book-1"))?.quantity).toBe(7);
    expect(await listPendingOutboxRows(database)).toEqual([
      expect.objectContaining({ id: "command-1", commandType: "ADD_BOOK_STOCK" }),
    ]);
  });

  it("serializes concurrent stock changes from committed quantities", async () => {
    await seedBook(database, "book-1", 2);

    await Promise.all([
      addBookStock(
        { bookId: "book-1", quantity: 1 },
        context(database, ["command-1", "transaction-1", "item-1"]),
      ),
      addBookStock(
        { bookId: "book-1", quantity: 1 },
        context(database, ["command-2", "transaction-2", "item-2"]),
      ),
    ]);

    expect((await getBookById(database, "book-1"))?.quantity).toBe(4);
  });

  it("issues same-stage books, decrements stock, and records issuance", async () => {
    await seedStudent(database);
    await seedBook(database, "book-1", 2);

    await issueBooksToStudent(
      { studentId: "student-1", bookIds: ["book-1"] },
      context(database, [
        "command-1",
        "transaction-1",
        "item-1",
        "student-book-1",
      ]),
    );

    expect((await getBookById(database, "book-1"))?.quantity).toBe(1);
    expect(await listActiveStudentBookRows(database, "student-1")).toHaveLength(1);
    expect(await listPendingOutboxRows(database)).toEqual([
      expect.objectContaining({ commandType: "ISSUE_BOOKS_TO_STUDENT" }),
    ]);
  });

  it("rejects cross-stage and zero-stock issues before mutation", async () => {
    await seedStudent(database, "primary");
    await seedBook(database, "wrong-stage", 2, "preparatory");
    await seedBook(database, "empty", 0, "primary");

    await expect(
      issueBooksToStudent(
        { studentId: "student-1", bookIds: ["wrong-stage"] },
        context(database, []),
      ),
    ).rejects.toThrow("student education stage");
    await expect(
      issueBooksToStudent(
        { studentId: "student-1", bookIds: ["empty"] },
        context(database, []),
      ),
    ).rejects.toThrow("zero stock");

    expect((await getBookById(database, "wrong-stage"))?.quantity).toBe(2);
    expect((await getBookById(database, "empty"))?.quantity).toBe(0);
    expect(await listInventoryTransactions(database)).toEqual([]);
  });

  it("reverses an issue once and restores stock", async () => {
    await seedStudent(database);
    await seedBook(database, "book-1", 1);
    await issueBooksToStudent(
      { studentId: "student-1", bookIds: ["book-1"] },
      context(database, [
        "issue-command",
        "issue-transaction",
        "issue-item",
        "student-book-1",
      ]),
    );

    await reverseTransaction(
      { transactionId: "issue-transaction" },
      context(database, ["reverse-command", "reverse-transaction", "reverse-item"]),
    );

    expect((await getBookById(database, "book-1"))?.quantity).toBe(1);
    expect(await listActiveStudentBookRows(database, "student-1")).toEqual([]);
    await expect(
      reverseTransaction(
        { transactionId: "issue-transaction" },
        context(database, []),
      ),
    ).rejects.toThrow("already been reversed");
  });
});
