import type {
  AddBookStockCommand,
  BookSelection,
  BookSemester,
  IssueBooksToStudentCommand,
  ReverseTransactionCommand,
} from "@app/shared";

import { runLocalTransaction } from "../db/local-transaction";
import { getCurrentAcademicYear } from "../db/repositories/academic-years";
import {
  getBookById,
  getBooksByIds,
  getBookSemesterQuantity,
  updateBookSemesterQuantity,
} from "../db/repositories/books";
import { enqueueSyncCommand } from "../db/repositories/outbox";
import { getStudentById } from "../db/repositories/students";
import {
  createInventoryTransaction,
  createStudentBookRows,
  getInventoryTransactionById,
  listInventoryTransactionItems,
  markInventoryTransactionReversed,
  markStudentBookRowsReversedForTransaction,
  type InventoryTransactionItemRow,
  type InventoryTransactionRow,
  type StudentBookRow,
} from "../db/repositories/transactions";
import type { SqlDatabase } from "../db/types";

export type InventoryServiceContext = {
  database: SqlDatabase;
  deviceId?: string;
  now?: () => string;
  createId?: () => string;
};

export type AddBookStockInput = {
  academicYear: string;
  bookId: string;
  semester: BookSemester;
  quantity: number;
  receiptNumber: string;
  receiptDate: string;
};
export type IssueBooksToStudentInput = {
  academicYear: string;
  studentId: string;
  bookSelections: BookSelection[];
};
export type ReverseTransactionInput = { academicYear: string; transactionId: string };

type ResolvedContext = Required<InventoryServiceContext>;

function resolve(context: InventoryServiceContext): ResolvedContext {
  return {
    database: context.database,
    deviceId: context.deviceId ?? "local-device",
    now: context.now ?? (() => new Date().toISOString()),
    createId: context.createId ?? (() => crypto.randomUUID()),
  };
}

async function assertCurrentYear(database: SqlDatabase, academicYear: string) {
  const current = await getCurrentAcademicYear(database);
  if (!current) throw new Error("Academic year is not initialized.");
  if (current.academicYear !== academicYear) {
    throw new Error(`Academic year is archived: ${academicYear}`);
  }
}

function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export async function addBookStock(
  input: AddBookStockInput,
  context: InventoryServiceContext,
): Promise<InventoryTransactionRow> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("Stock quantity must be a positive integer.");
  }
  const receiptNumber = input.receiptNumber.trim();
  if (!receiptNumber) throw new Error("Receipt number is required.");
  if (!isValidIsoDate(input.receiptDate)) throw new Error("Receipt date is invalid.");
  const ctx = resolve(context);
  return runLocalTransaction(ctx.database, async (database) => {
    await assertCurrentYear(database, input.academicYear);
    const book = await getBookById(database, input.bookId);
    if (!book) throw new Error(`Unknown book: ${input.bookId}`);
    const occurredAt = ctx.now();
    const commandId = ctx.createId();
    const transaction: InventoryTransactionRow = {
      id: ctx.createId(), scopeId: book.scopeId, academicYear: input.academicYear,
      type: "stock_increase", studentId: null, receiptNumber,
      receiptDate: input.receiptDate, reversedTransactionId: null,
      reversedByTransactionId: null, deviceId: ctx.deviceId, commandId,
      occurredAt, createdAt: occurredAt,
    };
    const quantityAfter = getBookSemesterQuantity(book, input.semester) + input.quantity;
    const item: InventoryTransactionItemRow = {
      id: ctx.createId(), transactionId: transaction.id, bookId: book.id,
      semester: input.semester, quantityDelta: input.quantity, quantityAfter,
      createdAt: occurredAt,
    };
    const command: AddBookStockCommand = {
      id: commandId, type: "ADD_BOOK_STOCK", deviceId: ctx.deviceId,
      occurredAt, academicYear: input.academicYear, bookId: book.id,
      semester: input.semester, quantity: input.quantity, receiptNumber,
      receiptDate: input.receiptDate,
    };
    await createInventoryTransaction(database, transaction, [item]);
    await updateBookSemesterQuantity(
      database,
      book.id,
      input.semester,
      quantityAfter,
      occurredAt,
    );
    await enqueueSyncCommand(database, command, occurredAt);
    return transaction;
  });
}

export async function issueBooksToStudent(
  input: IssueBooksToStudentInput,
  context: InventoryServiceContext,
): Promise<InventoryTransactionRow> {
  if (!input.bookSelections.length) throw new Error("Select at least one book semester.");
  const selectionKeys = input.bookSelections.map(selectionKey);
  if (new Set(selectionKeys).size !== selectionKeys.length) {
    throw new Error("Duplicate book semester selections are not allowed.");
  }
  const ctx = resolve(context);
  return runLocalTransaction(ctx.database, async (database) => {
    await assertCurrentYear(database, input.academicYear);
    const student = await getStudentById(database, input.studentId);
    if (!student) throw new Error(`Unknown student: ${input.studentId}`);
    if (student.academicYear !== input.academicYear) {
      throw new Error("Student does not belong to the selected academic year.");
    }
    const bookIds = [...new Set(input.bookSelections.map(({ bookId }) => bookId))];
    const books = await getBooksByIds(database, bookIds);
    const booksById = new Map(books.map((book) => [book.id, book]));
    const missing = bookIds.filter((id) => !booksById.has(id));
    if (missing.length) throw new Error(`Unknown books: ${missing.join(", ")}`);
    const wrongStage = books.filter(({ educationStage }) => educationStage !== student.educationStage);
    if (wrongStage.length) {
      throw new Error(
        `Books must match the student education stage: ${wrongStage.map(({ id }) => id).join(", ")}`,
      );
    }
    const empty = input.bookSelections.filter((selection) =>
      getBookSemesterQuantity(booksById.get(selection.bookId)!, selection.semester) <= 0);
    if (empty.length) {
      throw new Error(`Cannot issue book semesters with zero stock: ${empty.map(selectionKey).join(", ")}`);
    }

    const occurredAt = ctx.now();
    const commandId = ctx.createId();
    const transaction: InventoryTransactionRow = {
      id: ctx.createId(), scopeId: student.scopeId, academicYear: input.academicYear,
      type: "student_issue", studentId: student.id, receiptNumber: null,
      receiptDate: null, reversedTransactionId: null,
      reversedByTransactionId: null, deviceId: ctx.deviceId, commandId,
      occurredAt, createdAt: occurredAt,
    };
    const items: InventoryTransactionItemRow[] = [];
    const issued: StudentBookRow[] = [];
    for (const selection of input.bookSelections) {
      const book = booksById.get(selection.bookId)!;
      const quantityAfter = getBookSemesterQuantity(book, selection.semester) - 1;
      items.push({
        id: ctx.createId(), transactionId: transaction.id, bookId: book.id,
        semester: selection.semester, quantityDelta: -1, quantityAfter,
        createdAt: occurredAt,
      });
      issued.push({
        id: ctx.createId(), scopeId: student.scopeId, academicYear: input.academicYear,
        studentId: student.id, bookId: book.id, semester: selection.semester,
        issuedTransactionId: transaction.id, createdAt: occurredAt, reversedAt: null,
      });
    }
    const command: IssueBooksToStudentCommand = {
      id: commandId, type: "ISSUE_BOOKS_TO_STUDENT", deviceId: ctx.deviceId,
      occurredAt, academicYear: input.academicYear, studentId: student.id,
      bookSelections: input.bookSelections,
    };
    await createInventoryTransaction(database, transaction, items);
    await createStudentBookRows(database, issued);
    for (let index = 0; index < input.bookSelections.length; index += 1) {
      const selection = input.bookSelections[index];
      await updateBookSemesterQuantity(
        database,
        selection.bookId,
        selection.semester,
        items[index].quantityAfter,
        occurredAt,
      );
    }
    await enqueueSyncCommand(database, command, occurredAt);
    return transaction;
  });
}

export async function reverseTransaction(
  input: ReverseTransactionInput,
  context: InventoryServiceContext,
): Promise<InventoryTransactionRow> {
  const ctx = resolve(context);
  return runLocalTransaction(ctx.database, async (database) => {
    await assertCurrentYear(database, input.academicYear);
    const original = await getInventoryTransactionById(database, input.transactionId);
    if (!original) throw new Error(`Unknown transaction: ${input.transactionId}`);
    if (original.academicYear !== input.academicYear) {
      throw new Error("Archived academic year transactions cannot be reversed.");
    }
    if (original.reversedByTransactionId) {
      throw new Error(`Transaction has already been reversed: ${input.transactionId}`);
    }
    if (original.type === "reversal") {
      throw new Error(`Cannot reverse a reversal transaction: ${input.transactionId}`);
    }
    const originalItems = await listInventoryTransactionItems(database, original.id);
    const occurredAt = ctx.now();
    const commandId = ctx.createId();
    const reversal: InventoryTransactionRow = {
      id: ctx.createId(), scopeId: original.scopeId, academicYear: input.academicYear,
      type: "reversal", studentId: original.studentId, receiptNumber: null,
      receiptDate: null, reversedTransactionId: original.id,
      reversedByTransactionId: null, deviceId: ctx.deviceId, commandId,
      occurredAt, createdAt: occurredAt,
    };
    const reversalItems: InventoryTransactionItemRow[] = [];
    for (const originalItem of originalItems) {
      const book = await getBookById(database, originalItem.bookId);
      if (!book) throw new Error(`Unknown book: ${originalItem.bookId}`);
      const quantityAfter = getBookSemesterQuantity(book, originalItem.semester)
        - originalItem.quantityDelta;
      if (quantityAfter < 0) throw new Error("Cannot reverse stock below zero.");
      reversalItems.push({
        id: ctx.createId(), transactionId: reversal.id, bookId: book.id,
        semester: originalItem.semester, quantityDelta: -originalItem.quantityDelta,
        quantityAfter, createdAt: occurredAt,
      });
    }
    const command: ReverseTransactionCommand = {
      id: commandId, type: "REVERSE_TRANSACTION", deviceId: ctx.deviceId,
      occurredAt, academicYear: input.academicYear, transactionId: original.id,
    };
    await createInventoryTransaction(database, reversal, reversalItems);
    await markInventoryTransactionReversed(database, original.id, reversal.id);
    if (original.type === "student_issue") {
      await markStudentBookRowsReversedForTransaction(database, original.id, occurredAt);
    }
    for (const item of reversalItems) {
      await updateBookSemesterQuantity(
        database,
        item.bookId,
        item.semester,
        item.quantityAfter,
        occurredAt,
      );
    }
    await enqueueSyncCommand(database, command, occurredAt);
    return reversal;
  });
}

function selectionKey(selection: BookSelection) {
  return `${selection.bookId}:${selection.semester}`;
}
