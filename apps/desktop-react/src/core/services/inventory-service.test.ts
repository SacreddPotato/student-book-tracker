import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrations";
import { createInitialAcademicYear } from "../db/repositories/academic-years";
import { getBookById, upsertBook } from "../db/repositories/books";
import { listPendingOutboxRows } from "../db/repositories/outbox";
import { upsertStudent } from "../db/repositories/students";
import {
  getInventoryTransactionByCommandId,
  listActiveStudentBookRows,
  listInventoryTransactionItems,
  listInventoryTransactions,
} from "../db/repositories/transactions";
import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import {
  addBookStock,
  issueBooksToStudent,
  reverseTransaction,
  type InventoryServiceContext,
} from "./inventory-service";

const fixedNow = "2026-01-14T10:00:00.000Z";
const academicYear = "2025-2026";

function context(database: TestSqliteDatabase, ids: string[]): InventoryServiceContext {
  let index = 0;
  return {
    database,
    deviceId: "device-1",
    now: () => fixedNow,
    createId: () => ids[index++] ?? (() => { throw new Error("Missing test ID"); })(),
  };
}

async function seedStudent(database: TestSqliteDatabase, stage: "primary" | "preparatory" = "primary") {
  await upsertStudent(database, {
    id: "student-1", scopeId: "global", name: "Mona Ahmed",
    governmentId: "29801011234567", educationStage: stage,
    gradeLevel: stage === "primary" ? "primary1" : "preparatory1",
    academicYear, previousStudentId: null, createdAt: fixedNow,
    updatedAt: fixedNow, deletedAt: null,
  });
}

async function seedBook(
  database: TestSqliteDatabase,
  id: string,
  firstSemesterQuantity: number,
  secondSemesterQuantity: number,
  stage: "primary" | "preparatory" = "primary",
) {
  await upsertBook(database, {
    id, scopeId: "global", name: `${id} name`, educationStage: stage,
    firstSemesterQuantity, secondSemesterQuantity, createdAt: fixedNow,
    updatedAt: fixedNow, deletedAt: null,
  });
}

describe("React semester inventory service", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
    await createInitialAcademicYear(database, academicYear, fixedNow);
  });

  afterEach(() => database.close());

  it("adds stock to one semester with receipt metadata", async () => {
    await seedBook(database, "book-1", 2, 1);

    await addBookStock({
      academicYear, bookId: "book-1", semester: "second", quantity: 5,
      receiptNumber: " 00041 ", receiptDate: "2026-01-14",
    }, context(database, ["command-1", "transaction-1", "item-1"]));

    expect(await getBookById(database, "book-1")).toMatchObject({
      firstSemesterQuantity: 2,
      secondSemesterQuantity: 6,
    });
    expect(await getInventoryTransactionByCommandId(database, "command-1"))
      .toMatchObject({
        academicYear,
        receiptNumber: "00041",
        receiptDate: "2026-01-14",
      });
    expect(await listInventoryTransactionItems(database, "transaction-1"))
      .toEqual([expect.objectContaining({ semester: "second", quantityAfter: 6 })]);
  });

  it("rejects invalid stock receipt data before mutation", async () => {
    await seedBook(database, "book-1", 2, 1);
    await expect(addBookStock({
      academicYear, bookId: "book-1", semester: "first", quantity: 2,
      receiptNumber: " ", receiptDate: "2026-02-31",
    }, context(database, []))).rejects.toThrow();
    expect(await getBookById(database, "book-1")).toMatchObject({
      firstSemesterQuantity: 2,
      secondSemesterQuantity: 1,
    });
  });

  it("issues both semesters atomically and decrements each balance", async () => {
    await seedStudent(database);
    await seedBook(database, "book-1", 2, 3);

    await issueBooksToStudent({
      academicYear,
      studentId: "student-1",
      bookSelections: [
        { bookId: "book-1", semester: "first" },
        { bookId: "book-1", semester: "second" },
      ],
    }, context(database, [
      "command-1", "transaction-1", "item-first", "issued-first",
      "item-second", "issued-second",
    ]));

    expect(await getBookById(database, "book-1")).toMatchObject({
      firstSemesterQuantity: 1,
      secondSemesterQuantity: 2,
    });
    expect(await listActiveStudentBookRows(database, academicYear, "student-1"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ semester: "first" }),
        expect.objectContaining({ semester: "second" }),
      ]));
    expect(await listPendingOutboxRows(database)).toEqual([
      expect.objectContaining({ commandType: "ISSUE_BOOKS_TO_STUDENT" }),
    ]);
  });

  it("rejects an empty selected semester without partial mutation", async () => {
    await seedStudent(database);
    await seedBook(database, "book-1", 2, 0);

    await expect(issueBooksToStudent({
      academicYear,
      studentId: "student-1",
      bookSelections: [
        { bookId: "book-1", semester: "first" },
        { bookId: "book-1", semester: "second" },
      ],
    }, context(database, []))).rejects.toThrow("zero stock");

    expect(await getBookById(database, "book-1")).toMatchObject({
      firstSemesterQuantity: 2,
      secondSemesterQuantity: 0,
    });
    expect(await listInventoryTransactions(database, academicYear)).toEqual([]);
  });

  it("reverses an issue once and restores exact semester balances", async () => {
    await seedStudent(database);
    await seedBook(database, "book-1", 1, 1);
    await issueBooksToStudent({
      academicYear, studentId: "student-1",
      bookSelections: [{ bookId: "book-1", semester: "second" }],
    }, context(database, [
      "issue-command", "issue-transaction", "issue-item", "student-book-1",
    ]));

    await reverseTransaction(
      { academicYear, transactionId: "issue-transaction" },
      context(database, ["reverse-command", "reverse-transaction", "reverse-item"]),
    );

    expect(await getBookById(database, "book-1")).toMatchObject({
      firstSemesterQuantity: 1,
      secondSemesterQuantity: 1,
    });
    expect(await listActiveStudentBookRows(database, academicYear, "student-1"))
      .toEqual([]);
    await expect(reverseTransaction(
      { academicYear, transactionId: "issue-transaction" },
      context(database, []),
    )).rejects.toThrow("already been reversed");
  });
});
