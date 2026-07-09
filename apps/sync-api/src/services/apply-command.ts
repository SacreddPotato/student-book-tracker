import type { SyncCommand, SyncCommandResult } from "@app/shared";

import type {
  BookRecord,
  InventoryTransactionItemRecord,
  InventoryTransactionRecord,
  StudentBookRecord,
  StudentRecord,
  SyncChangeInput,
  SyncStore,
  SyncStoreTransaction,
} from "./sync-store";

type RejectionReason = NonNullable<SyncCommandResult["reasonCode"]>;

class CommandRejectedError extends Error {
  constructor(
    readonly reasonCode: RejectionReason,
    message: string,
  ) {
    super(message);
  }
}

export async function applyCommand(
  store: SyncStore,
  command: SyncCommand,
): Promise<SyncCommandResult> {
  try {
    return await store.transaction(async (transaction) => {
      if (await transaction.hasAppliedCommand(command.id)) {
        return { commandId: command.id, status: "duplicate" };
      }

      switch (command.type) {
        case "UPSERT_STUDENT":
          await applyUpsertStudent(transaction, command);
          break;
        case "UPSERT_BOOK":
          await applyUpsertBook(transaction, command);
          break;
        case "ADD_BOOK_STOCK":
          await applyAddBookStock(transaction, command);
          break;
        case "ISSUE_BOOKS_TO_STUDENT":
          await applyIssueBooksToStudent(transaction, command);
          break;
        case "REVERSE_TRANSACTION":
          await applyReverseTransaction(transaction, command);
          break;
      }

      return { commandId: command.id, status: "accepted" };
    });
  } catch (error) {
    if (error instanceof CommandRejectedError) {
      return {
        commandId: command.id,
        status: "rejected",
        reasonCode: error.reasonCode,
        message: error.message,
      };
    }

    throw error;
  }
}

async function applyUpsertStudent(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "UPSERT_STUDENT" }>,
): Promise<void> {
  const student = await transaction.upsertStudent({
    id: command.student.id,
    scopeId: "global",
    name: command.student.name,
    governmentId: command.student.governmentId,
    educationStage: command.student.educationStage,
    gradeLevel: command.student.gradeLevel,
    createdAt: command.occurredAt,
    updatedAt: command.occurredAt,
    deletedAt: null,
  });

  await recordChanges(transaction, command, [["students", student.id, student]]);
}

async function applyUpsertBook(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "UPSERT_BOOK" }>,
): Promise<void> {
  const book = await transaction.upsertBook({
    id: command.book.id,
    scopeId: "global",
    name: command.book.name,
    educationStage: command.book.educationStage,
    createdAt: command.occurredAt,
    updatedAt: command.occurredAt,
    deletedAt: null,
  });

  await recordChanges(transaction, command, [["books", book.id, book]]);
}

async function applyAddBookStock(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "ADD_BOOK_STOCK" }>,
): Promise<void> {
  if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
    reject("VALIDATION_FAILED", "Stock quantity must be a positive integer.");
  }

  const [book] = await transaction.getBooksForUpdate([command.bookId]);
  if (!book) {
    reject("UNKNOWN_BOOK", `Unknown book: ${command.bookId}`);
  }

  const updatedBook = await transaction.updateBook({
    ...book,
    quantity: book.quantity + command.quantity,
    updatedAt: command.occurredAt,
  });
  const inventoryTransaction = createInventoryTransaction(command, "stock_increase", null, null);
  const item = createInventoryItem(
    command.id,
    command.bookId,
    command.quantity,
    updatedBook.quantity,
    command.occurredAt,
  );

  await transaction.insertTransaction(inventoryTransaction);
  await transaction.insertTransactionItems([item]);
  await recordChanges(transaction, command, [
    ["books", updatedBook.id, updatedBook],
    ["inventory_transactions", inventoryTransaction.id, inventoryTransaction],
    ["inventory_transaction_items", item.id, item],
  ]);
}

async function applyIssueBooksToStudent(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "ISSUE_BOOKS_TO_STUDENT" }>,
): Promise<void> {
  const bookIds = [...new Set(command.bookIds)];
  if (bookIds.length === 0 || bookIds.length !== command.bookIds.length) {
    reject("VALIDATION_FAILED", "Issue commands must contain unique book IDs.");
  }

  const student = await transaction.getStudent(command.studentId);
  if (!student) {
    reject("UNKNOWN_STUDENT", `Unknown student: ${command.studentId}`);
  }

  const books = await transaction.getBooksForUpdate(bookIds);
  if (books.length !== bookIds.length) {
    const foundIds = new Set(books.map((book) => book.id));
    const missingBookId = bookIds.find((bookId) => !foundIds.has(bookId));
    reject("UNKNOWN_BOOK", `Unknown book: ${missingBookId}`);
  }

  const invalidStageBook = books.find(
    (book) => book.educationStage !== student.educationStage,
  );
  if (invalidStageBook) {
    reject("VALIDATION_FAILED", "Books must match the student's education stage.");
  }

  const outOfStockBook = books.find((book) => book.quantity <= 0);
  if (outOfStockBook) {
    reject("INSUFFICIENT_STOCK", `Insufficient stock for book: ${outOfStockBook.id}`);
  }

  const inventoryTransaction = createInventoryTransaction(
    command,
    "student_issue",
    student.id,
    null,
  );
  const updatedBooks: BookRecord[] = [];
  const items: InventoryTransactionItemRecord[] = [];
  const issuedBooks: StudentBookRecord[] = [];

  for (const bookId of bookIds) {
    const book = books.find((candidate) => candidate.id === bookId);
    if (!book) {
      reject("UNKNOWN_BOOK", `Unknown book: ${bookId}`);
    }

    const updatedBook = await transaction.updateBook({
      ...book,
      quantity: book.quantity - 1,
      updatedAt: command.occurredAt,
    });
    updatedBooks.push(updatedBook);
    items.push(
      createInventoryItem(
        command.id,
        book.id,
        -1,
        updatedBook.quantity,
        command.occurredAt,
      ),
    );
    issuedBooks.push({
      id: `${command.id}:student-book:${book.id}`,
      scopeId: student.scopeId,
      studentId: student.id,
      bookId: book.id,
      issuedTransactionId: inventoryTransaction.id,
      createdAt: command.occurredAt,
      reversedAt: null,
    });
  }

  await transaction.insertTransaction(inventoryTransaction);
  await transaction.insertTransactionItems(items);
  await transaction.insertStudentBooks(issuedBooks);
  await recordChanges(transaction, command, [
    ["inventory_transactions", inventoryTransaction.id, inventoryTransaction],
    ...updatedBooks.map((book) => ["books", book.id, book] as const),
    ...items.map((item) => ["inventory_transaction_items", item.id, item] as const),
    ...issuedBooks.map((issuedBook) => ["student_books", issuedBook.id, issuedBook] as const),
  ]);
}

async function applyReverseTransaction(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "REVERSE_TRANSACTION" }>,
): Promise<void> {
  const original = await transaction.getTransactionForUpdate(command.transactionId);
  if (!original) {
    reject("VALIDATION_FAILED", `Unknown transaction: ${command.transactionId}`);
  }

  if (original.type === "reversal" || original.reversedByTransactionId) {
    reject("TRANSACTION_ALREADY_REVERSED", "Transaction has already been reversed.");
  }

  const originalItems = await transaction.getTransactionItems(original.id);
  const books = await transaction.getBooksForUpdate(originalItems.map((item) => item.bookId));
  if (books.length !== originalItems.length) {
    reject("UNKNOWN_BOOK", "A book from the original transaction no longer exists.");
  }

  const reversal = createInventoryTransaction(command, "reversal", original.studentId, original.id);
  const updatedBooks: BookRecord[] = [];
  const reversalItems: InventoryTransactionItemRecord[] = [];

  for (const originalItem of originalItems) {
    const book = books.find((candidate) => candidate.id === originalItem.bookId);
    if (!book) {
      reject("UNKNOWN_BOOK", `Unknown book: ${originalItem.bookId}`);
    }

    const updatedBook = await transaction.updateBook({
      ...book,
      quantity: book.quantity - originalItem.quantityDelta,
      updatedAt: command.occurredAt,
    });
    updatedBooks.push(updatedBook);
    reversalItems.push(
      createInventoryItem(
        command.id,
        originalItem.bookId,
        -originalItem.quantityDelta,
        updatedBook.quantity,
        command.occurredAt,
      ),
    );
  }

  await transaction.insertTransaction(reversal);
  await transaction.insertTransactionItems(reversalItems);
  const reversedOriginal = await transaction.markTransactionReversed(original.id, reversal.id);
  const reversedStudentBooks =
    original.type === "student_issue"
      ? await transaction.markStudentBooksReversed(original.id, command.occurredAt)
      : [];

  await recordChanges(transaction, command, [
    ["inventory_transactions", reversal.id, reversal],
    ["inventory_transactions", reversedOriginal.id, reversedOriginal],
    ...updatedBooks.map((book) => ["books", book.id, book] as const),
    ...reversalItems.map((item) => ["inventory_transaction_items", item.id, item] as const),
    ...reversedStudentBooks.map((studentBook) => ["student_books", studentBook.id, studentBook] as const),
  ]);
}

function createInventoryTransaction(
  command: Extract<SyncCommand, { type: "ADD_BOOK_STOCK" | "ISSUE_BOOKS_TO_STUDENT" | "REVERSE_TRANSACTION" }>,
  type: "stock_increase" | "student_issue" | "reversal",
  studentId: string | null,
  reversedTransactionId: string | null,
): InventoryTransactionRecord {
  return {
    id: command.id,
    scopeId: "global",
    type,
    studentId,
    reversedTransactionId,
    reversedByTransactionId: null,
    deviceId: command.deviceId,
    commandId: command.id,
    occurredAt: command.occurredAt,
    createdAt: command.occurredAt,
  };
}

function createInventoryItem(
  commandId: string,
  bookId: string,
  quantityDelta: number,
  quantityAfter: number,
  createdAt: string,
): InventoryTransactionItemRecord {
  return {
    id: `${commandId}:item:${bookId}`,
    transactionId: commandId,
    bookId,
    quantityDelta,
    quantityAfter,
    createdAt,
  };
}

async function recordChanges(
  transaction: SyncStoreTransaction,
  command: SyncCommand,
  records: ReadonlyArray<readonly [string, string, unknown]>,
): Promise<void> {
  const changes: SyncChangeInput[] = records.map(([entityTable, entityId, payload]) => ({
    scopeId: "global",
    commandId: command.id,
    entityTable,
    entityId,
    payloadJson: JSON.stringify(payload),
    createdAt: command.occurredAt,
  }));

  await transaction.recordChanges(changes);
}

function reject(reasonCode: RejectionReason, message: string): never {
  throw new CommandRejectedError(reasonCode, message);
}
