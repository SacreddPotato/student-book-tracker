import { expect, test } from "@playwright/test";

import { runMigrations } from "../../src/lib/db/migrations";
import { getBookById, upsertBook } from "../../src/lib/db/repositories/books";
import { listPendingOutboxRows } from "../../src/lib/db/repositories/outbox";
import { upsertStudent } from "../../src/lib/db/repositories/students";
import {
  listActiveStudentBookRows,
  listInventoryTransactions,
} from "../../src/lib/db/repositories/transactions";
import { addBookStock, issueBooksToStudent } from "../../src/lib/services/inventory-service";

import { createIdSequence, TestSqliteDatabase } from "./test-database";

const now = "2026-07-10T12:00:00.000Z";

test("offline student-book workflow creates stock, issues it, and records history", async () => {
  const database = new TestSqliteDatabase();
  await runMigrations(database);

  await upsertBook(database, {
    id: "book-1",
    scopeId: "global",
    name: "Primary Math",
    educationStage: "primary",
    quantity: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await upsertStudent(database, {
    id: "student-1",
    scopeId: "global",
    name: "Mona Ahmed",
    governmentId: "29801011234567",
    educationStage: "primary",
    gradeLevel: "primary1",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await addBookStock(
    { bookId: "book-1", quantity: 2 },
    {
      database,
      deviceId: "e2e-device",
      now: () => now,
      createId: createIdSequence(["stock-command", "stock-transaction", "stock-item"]),
    },
  );
  await issueBooksToStudent(
    { studentId: "student-1", bookIds: ["book-1"] },
    {
      database,
      deviceId: "e2e-device",
      now: () => now,
      createId: createIdSequence([
        "issue-command",
        "issue-transaction",
        "issue-item",
        "student-book-1",
      ]),
    },
  );

  await expect.poll(async () => (await getBookById(database, "book-1"))?.quantity).toBe(1);
  expect(await listActiveStudentBookRows(database, "student-1")).toEqual([
    expect.objectContaining({ bookId: "book-1", issuedTransactionId: "issue-transaction" }),
  ]);
  expect((await listInventoryTransactions(database)).map(({ type }) => type)).toEqual(
    expect.arrayContaining(["student_issue", "stock_increase"]),
  );
  expect((await listPendingOutboxRows(database)).map(({ commandType }) => commandType)).toEqual([
    "ADD_BOOK_STOCK",
    "ISSUE_BOOKS_TO_STUDENT",
  ]);

  database.close();
});
