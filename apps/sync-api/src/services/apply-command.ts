import {
  nextAcademicYear,
  isGradeAllowedForStage,
  promoteGrade,
  type BookSemester,
  type SyncCommand,
  type SyncCommandResult,
} from "@app/shared";

import type {
  BookRecord,
  InventoryTransactionItemRecord,
  InventoryTransactionRecord,
  StudentBookRecord,
  SyncChangeInput,
  SyncStore,
  SyncStoreTransaction,
} from "./sync-store";

type RejectionReason = NonNullable<SyncCommandResult["reasonCode"]>;

class CommandRejectedError extends Error {
  constructor(readonly reasonCode: RejectionReason, message: string) {
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
        case "INITIALIZE_ACADEMIC_YEAR":
          await applyInitializeAcademicYear(transaction, command);
          break;
        case "ADVANCE_ACADEMIC_YEAR":
          await applyAdvanceAcademicYear(transaction, command);
          break;
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

async function applyInitializeAcademicYear(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "INITIALIZE_ACADEMIC_YEAR" }>,
) {
  if (await transaction.getCurrentAcademicYearForUpdate()) {
    reject("ACADEMIC_YEAR_ALREADY_INITIALIZED", "Academic year is already initialized.");
  }
  const row = await transaction.insertAcademicYear({
    academicYear: command.academicYear,
    status: "current",
    createdAt: command.occurredAt,
    archivedAt: null,
  });
  await recordChanges(transaction, command, [["academic_years", row.academicYear, row]]);
}

async function applyAdvanceAcademicYear(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "ADVANCE_ACADEMIC_YEAR" }>,
) {
  const current = await transaction.getCurrentAcademicYearForUpdate();
  if (!current) reject("ACADEMIC_YEAR_NOT_INITIALIZED", "Academic year is not initialized.");
  if (current.academicYear !== command.fromYear
    || nextAcademicYear(command.fromYear) !== command.toYear) {
    reject("ACADEMIC_YEAR_MISMATCH", "Academic year advancement is stale or not the exact successor.");
  }
  const students = await transaction.listStudentsForAcademicYear(command.fromYear);
  const eligible = students.flatMap((student) => {
    const promotion = promoteGrade(student.gradeLevel as Parameters<typeof promoteGrade>[0]);
    return promotion ? [{ student, promotion }] : [];
  });
  const snapshotsByPreviousId = new Map(
    command.promotedStudents.map((snapshot) => [snapshot.previousStudentId, snapshot]),
  );
  if (snapshotsByPreviousId.size !== command.promotedStudents.length
    || command.promotedStudents.length !== eligible.length
    || new Set(command.promotedStudents.map(({ id }) => id)).size !== command.promotedStudents.length) {
    reject("VALIDATION_FAILED", "Promoted student snapshots do not match the current year.");
  }
  for (const { student, promotion } of eligible) {
    const snapshot = snapshotsByPreviousId.get(student.id);
    if (!snapshot
      || snapshot.name !== student.name
      || snapshot.governmentId !== student.governmentId
      || snapshot.educationStage !== promotion.educationStage
      || snapshot.gradeLevel !== promotion.gradeLevel
      || snapshot.academicYear !== command.toYear) {
      reject("VALIDATION_FAILED", `Invalid promotion snapshot for student: ${student.id}`);
    }
  }

  const archived = await transaction.archiveAcademicYear(command.fromYear, command.occurredAt);
  const next = await transaction.insertAcademicYear({
    academicYear: command.toYear,
    status: "current",
    createdAt: command.occurredAt,
    archivedAt: null,
  });
  const promoted = [];
  for (const snapshot of command.promotedStudents) {
    promoted.push(await transaction.upsertStudent({
      id: snapshot.id,
      scopeId: "global",
      name: snapshot.name,
      governmentId: snapshot.governmentId,
      educationStage: snapshot.educationStage,
      gradeLevel: snapshot.gradeLevel,
      academicYear: snapshot.academicYear,
      previousStudentId: snapshot.previousStudentId,
      createdAt: command.occurredAt,
      updatedAt: command.occurredAt,
      deletedAt: null,
    }));
  }
  await recordChanges(transaction, command, [
    ["academic_years", archived.academicYear, archived],
    ["academic_years", next.academicYear, next],
    ...promoted.map((student) => ["students", student.id, student] as const),
  ]);
}

async function applyUpsertStudent(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "UPSERT_STUDENT" }>,
) {
  await assertCurrentAcademicYear(transaction, command.student.academicYear);
  if (!isGradeAllowedForStage(command.student.educationStage, command.student.gradeLevel)) {
    reject("VALIDATION_FAILED", "Student grade does not belong to the education stage.");
  }
  const student = await transaction.upsertStudent({
    id: command.student.id,
    scopeId: "global",
    name: command.student.name,
    governmentId: command.student.governmentId,
    educationStage: command.student.educationStage,
    gradeLevel: command.student.gradeLevel,
    academicYear: command.student.academicYear,
    previousStudentId: command.student.previousStudentId,
    createdAt: command.occurredAt,
    updatedAt: command.occurredAt,
    deletedAt: null,
  });
  await recordChanges(transaction, command, [["students", student.id, student]]);
}

async function applyUpsertBook(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "UPSERT_BOOK" }>,
) {
  const book = await transaction.upsertBook({
    id: command.book.id,
    scopeId: "global",
    name: command.book.name,
    educationStage: command.book.educationStage,
    gradeLevel: command.book.gradeLevel,
    createdAt: command.occurredAt,
    updatedAt: command.occurredAt,
    deletedAt: null,
  });
  await recordChanges(transaction, command, [["books", book.id, book]]);
}

async function applyAddBookStock(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "ADD_BOOK_STOCK" }>,
) {
  await assertCurrentAcademicYear(transaction, command.academicYear);
  if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
    reject("VALIDATION_FAILED", "Stock quantity must be a positive integer.");
  }
  if (!command.receiptNumber.trim() || !isValidIsoDate(command.receiptDate)) {
    reject("VALIDATION_FAILED", "A valid receipt number and date are required.");
  }
  const [book] = await transaction.getBooksForUpdate([command.bookId]);
  if (!book) reject("UNKNOWN_BOOK", `Unknown book: ${command.bookId}`);
  const quantityAfter = quantityFor(book, command.semester) + command.quantity;
  const updatedBook = await transaction.updateBook(
    withQuantity(book, command.semester, quantityAfter, command.occurredAt),
  );
  const inventoryTransaction = createInventoryTransaction(
    command,
    "stock_increase",
    null,
    null,
    command.receiptNumber.trim(),
    command.receiptDate,
  );
  const item = createInventoryItem(
    command.id,
    command.bookId,
    command.semester,
    command.quantity,
    quantityAfter,
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
) {
  await assertCurrentAcademicYear(transaction, command.academicYear);
  const selectionKeys = command.bookSelections.map(selectionKey);
  if (!selectionKeys.length || new Set(selectionKeys).size !== selectionKeys.length) {
    reject("VALIDATION_FAILED", "Issue commands require unique book semester selections.");
  }
  const student = await transaction.getStudent(command.studentId);
  if (!student) reject("UNKNOWN_STUDENT", `Unknown student: ${command.studentId}`);
  if (student.academicYear !== command.academicYear) {
    reject("ACADEMIC_YEAR_MISMATCH", "Student is not enrolled in the current academic year.");
  }
  const bookIds = [...new Set(command.bookSelections.map(({ bookId }) => bookId))];
  const books = await transaction.getBooksForUpdate(bookIds);
  if (books.length !== bookIds.length) {
    const found = new Set(books.map(({ id }) => id));
    reject("UNKNOWN_BOOK", `Unknown book: ${bookIds.find((id) => !found.has(id))}`);
  }
  const booksById = new Map(books.map((book) => [book.id, book]));
  if (books.some((book) => book.educationStage !== student.educationStage)) {
    reject("VALIDATION_FAILED", "Books must match the student's education stage.");
  }
  const empty = command.bookSelections.find((selection) =>
    quantityFor(booksById.get(selection.bookId)!, selection.semester) <= 0);
  if (empty) reject("INSUFFICIENT_STOCK", `Insufficient stock for ${selectionKey(empty)}`);

  const inventoryTransaction = createInventoryTransaction(
    command,
    "student_issue",
    student.id,
    null,
    null,
    null,
  );
  const workingBooks = new Map(books.map((book) => [book.id, book]));
  const items: InventoryTransactionItemRecord[] = [];
  const issuedBooks: StudentBookRecord[] = [];
  for (const selection of command.bookSelections) {
    const book = workingBooks.get(selection.bookId)!;
    const quantityAfter = quantityFor(book, selection.semester) - 1;
    workingBooks.set(
      book.id,
      withQuantity(book, selection.semester, quantityAfter, command.occurredAt),
    );
    items.push(createInventoryItem(
      command.id,
      book.id,
      selection.semester,
      -1,
      quantityAfter,
      command.occurredAt,
    ));
    issuedBooks.push({
      id: `${command.id}:student-book:${book.id}:${selection.semester}`,
      scopeId: student.scopeId,
      academicYear: command.academicYear,
      studentId: student.id,
      bookId: book.id,
      semester: selection.semester,
      issuedTransactionId: inventoryTransaction.id,
      createdAt: command.occurredAt,
      reversedAt: null,
    });
  }
  const updatedBooks = [];
  for (const book of workingBooks.values()) updatedBooks.push(await transaction.updateBook(book));
  await transaction.insertTransaction(inventoryTransaction);
  await transaction.insertTransactionItems(items);
  await transaction.insertStudentBooks(issuedBooks);
  await recordChanges(transaction, command, [
    ["inventory_transactions", inventoryTransaction.id, inventoryTransaction],
    ...updatedBooks.map((book) => ["books", book.id, book] as const),
    ...items.map((item) => ["inventory_transaction_items", item.id, item] as const),
    ...issuedBooks.map((row) => ["student_books", row.id, row] as const),
  ]);
}

async function applyReverseTransaction(
  transaction: SyncStoreTransaction,
  command: Extract<SyncCommand, { type: "REVERSE_TRANSACTION" }>,
) {
  await assertCurrentAcademicYear(transaction, command.academicYear);
  const original = await transaction.getTransactionForUpdate(command.transactionId);
  if (!original) reject("VALIDATION_FAILED", `Unknown transaction: ${command.transactionId}`);
  if (original.academicYear !== command.academicYear) {
    reject("ACADEMIC_YEAR_ARCHIVED", "Archived academic year transactions cannot be reversed.");
  }
  if (original.type === "reversal" || original.reversedByTransactionId) {
    reject("TRANSACTION_ALREADY_REVERSED", "Transaction has already been reversed.");
  }
  const originalItems = await transaction.getTransactionItems(original.id);
  const bookIds = [...new Set(originalItems.map(({ bookId }) => bookId))];
  const books = await transaction.getBooksForUpdate(bookIds);
  if (books.length !== bookIds.length) reject("UNKNOWN_BOOK", "A referenced book no longer exists.");
  const workingBooks = new Map(books.map((book) => [book.id, book]));
  const reversal = createInventoryTransaction(
    command,
    "reversal",
    original.studentId,
    original.id,
    null,
    null,
  );
  const reversalItems: InventoryTransactionItemRecord[] = [];
  for (const originalItem of originalItems) {
    const book = workingBooks.get(originalItem.bookId)!;
    const quantityAfter = quantityFor(book, originalItem.semester as BookSemester)
      - originalItem.quantityDelta;
    if (quantityAfter < 0) reject("INSUFFICIENT_STOCK", "Reversal would make stock negative.");
    workingBooks.set(
      book.id,
      withQuantity(book, originalItem.semester as BookSemester, quantityAfter, command.occurredAt),
    );
    reversalItems.push(createInventoryItem(
      command.id,
      originalItem.bookId,
      originalItem.semester as BookSemester,
      -originalItem.quantityDelta,
      quantityAfter,
      command.occurredAt,
    ));
  }
  const updatedBooks = [];
  for (const book of workingBooks.values()) updatedBooks.push(await transaction.updateBook(book));
  await transaction.insertTransaction(reversal);
  await transaction.insertTransactionItems(reversalItems);
  const reversedOriginal = await transaction.markTransactionReversed(original.id, reversal.id);
  const reversedStudentBooks = original.type === "student_issue"
    ? await transaction.markStudentBooksReversed(original.id, command.occurredAt)
    : [];
  await recordChanges(transaction, command, [
    ["inventory_transactions", reversal.id, reversal],
    ["inventory_transactions", reversedOriginal.id, reversedOriginal],
    ...updatedBooks.map((book) => ["books", book.id, book] as const),
    ...reversalItems.map((item) => ["inventory_transaction_items", item.id, item] as const),
    ...reversedStudentBooks.map((row) => ["student_books", row.id, row] as const),
  ]);
}

async function assertCurrentAcademicYear(
  transaction: SyncStoreTransaction,
  academicYear: string,
) {
  const current = await transaction.getCurrentAcademicYearForUpdate();
  if (!current) reject("ACADEMIC_YEAR_NOT_INITIALIZED", "Academic year is not initialized.");
  if (current.academicYear !== academicYear) {
    reject("ACADEMIC_YEAR_ARCHIVED", `Academic year is not current: ${academicYear}`);
  }
}

function quantityFor(book: BookRecord, semester: BookSemester) {
  return semester === "first" ? book.firstSemesterQuantity : book.secondSemesterQuantity;
}

function withQuantity(
  book: BookRecord,
  semester: BookSemester,
  quantity: number,
  updatedAt: string,
): BookRecord {
  return semester === "first"
    ? { ...book, firstSemesterQuantity: quantity, updatedAt }
    : { ...book, secondSemesterQuantity: quantity, updatedAt };
}

function createInventoryTransaction(
  command: Extract<SyncCommand, {
    type: "ADD_BOOK_STOCK" | "ISSUE_BOOKS_TO_STUDENT" | "REVERSE_TRANSACTION";
  }>,
  type: "stock_increase" | "student_issue" | "reversal",
  studentId: string | null,
  reversedTransactionId: string | null,
  receiptNumber: string | null,
  receiptDate: string | null,
): InventoryTransactionRecord {
  return {
    id: command.id,
    scopeId: "global",
    academicYear: command.academicYear,
    type,
    studentId,
    receiptNumber,
    receiptDate,
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
  semester: BookSemester,
  quantityDelta: number,
  quantityAfter: number,
  createdAt: string,
): InventoryTransactionItemRecord {
  return {
    id: `${commandId}:item:${bookId}:${semester}`,
    transactionId: commandId,
    bookId,
    semester,
    quantityDelta,
    quantityAfter,
    createdAt,
  };
}

function selectionKey(selection: { bookId: string; semester: BookSemester }) {
  return `${selection.bookId}:${selection.semester}`;
}

function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

async function recordChanges(
  transaction: SyncStoreTransaction,
  command: SyncCommand,
  records: ReadonlyArray<readonly [string, string, unknown]>,
) {
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
