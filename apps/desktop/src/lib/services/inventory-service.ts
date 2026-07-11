import { initializeLocalDatabase, type SqlDatabase } from "../db/local-db";
import { runLocalTransaction } from "../db/local-transaction";
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
import type {
  LegacyAddBookStockCommand,
  LegacyIssueBooksToStudentCommand,
  LegacyReverseTransactionCommand,
} from "../sync/legacy-sync-command";

export type InventoryServiceContext = {
  database?: SqlDatabase;
  deviceId?: string;
  now?: () => string;
  createId?: () => string;
};

export type AddBookStockInput = {
  bookId: string;
  quantity: number;
};

export type IssueBooksToStudentInput = {
  studentId: string;
  bookIds: string[];
};

export type ReverseTransactionInput = {
  transactionId: string;
};

type ResolvedContext = Required<InventoryServiceContext>;

const defaultDeviceId = "local-device";

export async function addBookStock(
  input: AddBookStockInput,
  context: InventoryServiceContext = {},
): Promise<InventoryTransactionRow> {
  if (input.quantity <= 0) {
    throw new Error("Stock quantity must be greater than zero.");
  }

  const resolved = await resolveContext(context);
  return runLocalTransaction(resolved.database, async (database) => {
    const book = await getBookById(database, input.bookId);
    if (!book) {
      throw new Error(`Unknown book: ${input.bookId}`);
    }

    const occurredAt = resolved.now();
    const commandId = resolved.createId();
    const transaction: InventoryTransactionRow = {
      id: resolved.createId(),
      scopeId: book.scopeId,
      type: "stock_increase",
      studentId: null,
      reversedTransactionId: null,
      reversedByTransactionId: null,
      deviceId: resolved.deviceId,
      commandId,
      occurredAt,
      createdAt: occurredAt,
    };
    const quantityAfter = book.quantity + input.quantity;
    const items: InventoryTransactionItemRow[] = [{
      id: resolved.createId(),
      transactionId: transaction.id,
      bookId: book.id,
      quantityDelta: input.quantity,
      quantityAfter,
      createdAt: occurredAt,
    }];
    const command: LegacyAddBookStockCommand = {
      id: commandId,
      type: "ADD_BOOK_STOCK",
      deviceId: resolved.deviceId,
      occurredAt,
      bookId: book.id,
      quantity: input.quantity,
    };

    await createInventoryTransaction(database, transaction, items);
    await updateBookQuantity(database, book.id, quantityAfter, occurredAt);
    await enqueueSyncCommand(database, command, occurredAt);
    return transaction;
  });
}

export async function issueBooksToStudent(
  input: IssueBooksToStudentInput,
  context: InventoryServiceContext = {},
): Promise<InventoryTransactionRow> {
  const resolved = await resolveContext(context);
  return runLocalTransaction(resolved.database, async (database) => {
    const student = await getStudentById(database, input.studentId);
    if (!student) {
      throw new Error(`Unknown student: ${input.studentId}`);
    }

    const books = await getBooksByIds(database, input.bookIds);
    const foundBookIds = new Set(books.map(({ id }) => id));
    const missingBookIds = input.bookIds.filter((bookId) => !foundBookIds.has(bookId));
    if (missingBookIds.length > 0) {
      throw new Error(`Unknown books: ${missingBookIds.join(", ")}`);
    }

    const emptyBookIds = books.filter(({ quantity }) => quantity <= 0).map(({ id }) => id);
    if (emptyBookIds.length > 0) {
      throw new Error(`Cannot issue books with zero stock: ${emptyBookIds.join(", ")}`);
    }

    const occurredAt = resolved.now();
    const commandId = resolved.createId();
    const transaction: InventoryTransactionRow = {
      id: resolved.createId(),
      scopeId: student.scopeId,
      type: "student_issue",
      studentId: student.id,
      reversedTransactionId: null,
      reversedByTransactionId: null,
      deviceId: resolved.deviceId,
      commandId,
      occurredAt,
      createdAt: occurredAt,
    };
    const items: InventoryTransactionItemRow[] = [];
    const studentBookRows: StudentBookRow[] = [];

    for (const book of books) {
      const quantityAfter = book.quantity - 1;
      items.push({
        id: resolved.createId(),
        transactionId: transaction.id,
        bookId: book.id,
        quantityDelta: -1,
        quantityAfter,
        createdAt: occurredAt,
      });
      studentBookRows.push({
        id: resolved.createId(),
        scopeId: student.scopeId,
        studentId: student.id,
        bookId: book.id,
        issuedTransactionId: transaction.id,
        createdAt: occurredAt,
        reversedAt: null,
      });
    }

    const command: LegacyIssueBooksToStudentCommand = {
      id: commandId,
      type: "ISSUE_BOOKS_TO_STUDENT",
      deviceId: resolved.deviceId,
      occurredAt,
      studentId: student.id,
      bookIds: books.map(({ id }) => id),
    };

    await createInventoryTransaction(database, transaction, items);
    await createStudentBookRows(database, studentBookRows);

    for (const [index, book] of books.entries()) {
      await updateBookQuantity(database, book.id, items[index].quantityAfter, occurredAt);
    }

    await enqueueSyncCommand(database, command, occurredAt);
    return transaction;
  });
}

export async function reverseTransaction(
  input: ReverseTransactionInput,
  context: InventoryServiceContext = {},
): Promise<InventoryTransactionRow> {
  const resolved = await resolveContext(context);
  return runLocalTransaction(resolved.database, async (transaction) =>
    reverseTransactionInDatabase(input, resolved, transaction),
  );
}

async function reverseTransactionInDatabase(
  input: ReverseTransactionInput,
  resolved: ResolvedContext,
  database: SqlDatabase,
): Promise<InventoryTransactionRow> {
  const originalTransaction = await getInventoryTransactionById(
    database,
    input.transactionId,
  );

  if (!originalTransaction) {
    throw new Error(`Unknown transaction: ${input.transactionId}`);
  }

  if (originalTransaction.reversedByTransactionId) {
    throw new Error(`Transaction has already been reversed: ${input.transactionId}`);
  }

  if (originalTransaction.type === "reversal") {
    throw new Error(`Cannot reverse a reversal transaction: ${input.transactionId}`);
  }

  const originalItems = await listInventoryTransactionItems(
    database,
    originalTransaction.id,
  );
  const occurredAt = resolved.now();
  const commandId = resolved.createId();
  const reversal: InventoryTransactionRow = {
    id: resolved.createId(),
    scopeId: originalTransaction.scopeId,
    type: "reversal",
    studentId: originalTransaction.studentId,
    reversedTransactionId: originalTransaction.id,
    reversedByTransactionId: null,
    deviceId: resolved.deviceId,
    commandId,
    occurredAt,
    createdAt: occurredAt,
  };
  const reversalItems: InventoryTransactionItemRow[] = [];

  for (const item of originalItems) {
    const book = await getBookById(database, item.bookId);
    if (!book) {
      throw new Error(`Unknown book: ${item.bookId}`);
    }

    reversalItems.push({
      id: resolved.createId(),
      transactionId: reversal.id,
      bookId: item.bookId,
      quantityDelta: -item.quantityDelta,
      quantityAfter: book.quantity - item.quantityDelta,
      createdAt: occurredAt,
    });
  }

  const command: LegacyReverseTransactionCommand = {
    id: commandId,
    type: "REVERSE_TRANSACTION",
    deviceId: resolved.deviceId,
    occurredAt,
    transactionId: originalTransaction.id,
  };

  await createInventoryTransaction(database, reversal, reversalItems);
  await markInventoryTransactionReversed(
    database,
    originalTransaction.id,
    reversal.id,
  );

  for (const item of reversalItems) {
    await updateBookQuantity(database, item.bookId, item.quantityAfter, occurredAt);
  }

  if (originalTransaction.type === "student_issue") {
    await markStudentBookRowsReversedForTransaction(
      database,
      originalTransaction.id,
      occurredAt,
    );
  }

  await enqueueSyncCommand(database, command, occurredAt);

  return reversal;
}

async function resolveContext(context: InventoryServiceContext): Promise<ResolvedContext> {
  return {
    database: context.database ?? (await initializeLocalDatabase()),
    deviceId: context.deviceId ?? defaultDeviceId,
    now: context.now ?? (() => new Date().toISOString()),
    createId: context.createId ?? (() => crypto.randomUUID()),
  };
}
