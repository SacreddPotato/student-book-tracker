import type {
  AddBookStockCommand,
  IssueBooksToStudentCommand,
  ReverseTransactionCommand,
} from "@app/shared";

import { getBookById, getBooksByIds, updateBookQuantity } from "../db/repositories/books";
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
import { runLocalTransaction } from "../db/local-transaction";
import type { SqlDatabase } from "../db/types";

export type InventoryServiceContext = {
  database: SqlDatabase;
  deviceId?: string;
  now?: () => string;
  createId?: () => string;
};

export type AddBookStockInput = { bookId: string; quantity: number };
export type IssueBooksToStudentInput = { studentId: string; bookIds: string[] };
export type ReverseTransactionInput = { transactionId: string };

type ResolvedContext = Required<InventoryServiceContext>;

function resolve(context: InventoryServiceContext): ResolvedContext {
  return {
    database: context.database,
    deviceId: context.deviceId ?? "local-device",
    now: context.now ?? (() => new Date().toISOString()),
    createId: context.createId ?? (() => crypto.randomUUID()),
  };
}

export async function addBookStock(
  input: AddBookStockInput,
  context: InventoryServiceContext,
): Promise<InventoryTransactionRow> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("Stock quantity must be a positive integer.");
  }
  const ctx = resolve(context);
  return runLocalTransaction(ctx.database, async (database) => {
    const book = await getBookById(database, input.bookId);
    if (!book) throw new Error(`Unknown book: ${input.bookId}`);
    const occurredAt = ctx.now();
    const commandId = ctx.createId();
    const transaction: InventoryTransactionRow = {
      id: ctx.createId(), scopeId: book.scopeId, type: "stock_increase",
      studentId: null, reversedTransactionId: null, reversedByTransactionId: null,
      deviceId: ctx.deviceId, commandId, occurredAt, createdAt: occurredAt,
    };
    const quantityAfter = book.quantity + input.quantity;
    const item: InventoryTransactionItemRow = {
      id: ctx.createId(), transactionId: transaction.id, bookId: book.id,
      quantityDelta: input.quantity, quantityAfter, createdAt: occurredAt,
    };
    const command: AddBookStockCommand = {
      id: commandId, type: "ADD_BOOK_STOCK", deviceId: ctx.deviceId,
      occurredAt, bookId: book.id, quantity: input.quantity,
    };
    await createInventoryTransaction(database, transaction, [item]);
    await updateBookQuantity(database, book.id, quantityAfter, occurredAt);
    await enqueueSyncCommand(database, command, occurredAt);
    return transaction;
  });
}

export async function issueBooksToStudent(
  input: IssueBooksToStudentInput,
  context: InventoryServiceContext,
): Promise<InventoryTransactionRow> {
  if (!input.bookIds.length) throw new Error("Select at least one book.");
  if (new Set(input.bookIds).size !== input.bookIds.length) {
    throw new Error("Duplicate book IDs are not allowed.");
  }
  const ctx = resolve(context);
  return runLocalTransaction(ctx.database, async (database) => {
    const student = await getStudentById(database, input.studentId);
    if (!student) throw new Error(`Unknown student: ${input.studentId}`);
    const books = await getBooksByIds(database, input.bookIds);
    const found = new Set(books.map(({ id }) => id));
    const missing = input.bookIds.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`Unknown books: ${missing.join(", ")}`);
    const wrongStage = books.filter(
      ({ educationStage }) => educationStage !== student.educationStage,
    );
    if (wrongStage.length) {
      throw new Error(
        `Books must match the student education stage: ${wrongStage.map(({ id }) => id).join(", ")}`,
      );
    }
    const empty = books.filter(({ quantity }) => quantity <= 0);
    if (empty.length) {
      throw new Error(`Cannot issue books with zero stock: ${empty.map(({ id }) => id).join(", ")}`);
    }

    const occurredAt = ctx.now();
    const commandId = ctx.createId();
    const transaction: InventoryTransactionRow = {
      id: ctx.createId(), scopeId: student.scopeId, type: "student_issue",
      studentId: student.id, reversedTransactionId: null,
      reversedByTransactionId: null, deviceId: ctx.deviceId, commandId,
      occurredAt, createdAt: occurredAt,
    };
    const items: InventoryTransactionItemRow[] = [];
    const issued: StudentBookRow[] = [];
    for (const book of books) {
      const quantityAfter = book.quantity - 1;
      items.push({
        id: ctx.createId(), transactionId: transaction.id, bookId: book.id,
        quantityDelta: -1, quantityAfter, createdAt: occurredAt,
      });
      issued.push({
        id: ctx.createId(), scopeId: student.scopeId, studentId: student.id,
        bookId: book.id, issuedTransactionId: transaction.id,
        createdAt: occurredAt, reversedAt: null,
      });
    }
    const command: IssueBooksToStudentCommand = {
      id: commandId, type: "ISSUE_BOOKS_TO_STUDENT", deviceId: ctx.deviceId,
      occurredAt, studentId: student.id, bookIds: books.map(({ id }) => id),
    };
    await createInventoryTransaction(database, transaction, items);
    await createStudentBookRows(database, issued);
    for (const [index, book] of books.entries()) {
      await updateBookQuantity(database, book.id, items[index].quantityAfter, occurredAt);
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
    const original = await getInventoryTransactionById(database, input.transactionId);
    if (!original) throw new Error(`Unknown transaction: ${input.transactionId}`);
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
      id: ctx.createId(), scopeId: original.scopeId, type: "reversal",
      studentId: original.studentId, reversedTransactionId: original.id,
      reversedByTransactionId: null, deviceId: ctx.deviceId, commandId,
      occurredAt, createdAt: occurredAt,
    };
    const items: InventoryTransactionItemRow[] = [];
    for (const originalItem of originalItems) {
      const book = await getBookById(database, originalItem.bookId);
      if (!book) throw new Error(`Unknown book: ${originalItem.bookId}`);
      items.push({
        id: ctx.createId(), transactionId: reversal.id, bookId: book.id,
        quantityDelta: -originalItem.quantityDelta,
        quantityAfter: book.quantity - originalItem.quantityDelta,
        createdAt: occurredAt,
      });
    }
    const command: ReverseTransactionCommand = {
      id: commandId, type: "REVERSE_TRANSACTION", deviceId: ctx.deviceId,
      occurredAt, transactionId: original.id,
    };
    await createInventoryTransaction(database, reversal, items);
    await markInventoryTransactionReversed(database, original.id, reversal.id);
    for (const item of items) {
      await updateBookQuantity(database, item.bookId, item.quantityAfter, occurredAt);
    }
    if (original.type === "student_issue") {
      await markStudentBookRowsReversedForTransaction(database, original.id, occurredAt);
    }
    await enqueueSyncCommand(database, command, occurredAt);
    return reversal;
  });
}
