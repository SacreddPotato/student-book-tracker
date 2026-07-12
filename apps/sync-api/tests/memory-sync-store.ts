import type {
  AcademicYearRecord,
  BookRecord,
  InventoryTransactionItemRecord,
  InventoryTransactionRecord,
  StudentBookRecord,
  StudentRecord,
  SyncChangeInput,
  SyncStore,
  SyncStoreTransaction,
} from "../src/services/sync-store";
import type { PulledChange, SyncChangeReader } from "../src/services/pull-changes";

export class MemorySyncStore implements SyncStore, SyncStoreTransaction, SyncChangeReader {
  readonly academicYears = new Map<string, AcademicYearRecord>();
  readonly students = new Map<string, StudentRecord>();
  readonly books = new Map<string, BookRecord>();
  readonly transactions = new Map<string, InventoryTransactionRecord>();
  readonly transactionItems = new Map<string, InventoryTransactionItemRecord>();
  readonly studentBookRows = new Map<string, StudentBookRecord>();
  readonly changes: PulledChange[] = [];

  async transaction<T>(
    operation: (transaction: SyncStoreTransaction) => Promise<T>,
  ): Promise<T> {
    const draft = this.clone();
    const result = await operation(draft);
    this.replaceWith(draft);
    return result;
  }

  async hasAppliedCommand(commandId: string): Promise<boolean> {
    return this.changes.some((change) => change.commandId === commandId);
  }

  async getCurrentAcademicYearForUpdate(): Promise<AcademicYearRecord | null> {
    const row = [...this.academicYears.values()].find(({ status }) => status === "current");
    return row ? structuredClone(row) : null;
  }

  async insertAcademicYear(record: AcademicYearRecord): Promise<AcademicYearRecord> {
    if ([...this.academicYears.values()].some(({ status }) => status === "current")
      && record.status === "current") {
      throw new Error("Current academic year already exists.");
    }
    this.academicYears.set(record.academicYear, structuredClone(record));
    return structuredClone(record);
  }

  async archiveAcademicYear(
    academicYear: string,
    archivedAt: string,
  ): Promise<AcademicYearRecord> {
    const row = this.academicYears.get(academicYear);
    if (!row || row.status !== "current") throw new Error("Current academic year not found.");
    const archived = { ...row, status: "archived", archivedAt } as AcademicYearRecord;
    this.academicYears.set(academicYear, archived);
    return structuredClone(archived);
  }

  async listStudentsForAcademicYear(academicYear: string): Promise<StudentRecord[]> {
    return [...this.students.values()]
      .filter((student) => student.academicYear === academicYear && !student.deletedAt)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((student) => structuredClone(student));
  }

  async getStudent(studentId: string): Promise<StudentRecord | null> {
    const student = this.students.get(studentId);
    return student && !student.deletedAt ? structuredClone(student) : null;
  }

  async getBooksForUpdate(bookIds: string[]): Promise<BookRecord[]> {
    return [...bookIds]
      .sort()
      .map((bookId) => this.books.get(bookId))
      .filter((book): book is BookRecord => Boolean(book && !book.deletedAt))
      .map((book) => structuredClone(book));
  }

  async getTransactionForUpdate(
    transactionId: string,
  ): Promise<InventoryTransactionRecord | null> {
    const transaction =
      this.transactions.get(transactionId) ??
      [...this.transactions.values()].find(
        (candidate) => candidate.commandId === transactionId,
      );
    return transaction ? structuredClone(transaction) : null;
  }

  async getTransactionItems(
    transactionId: string,
  ): Promise<InventoryTransactionItemRecord[]> {
    return [...this.transactionItems.values()]
      .filter((item) => item.transactionId === transactionId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => structuredClone(item));
  }

  async upsertStudent(record: StudentRecord): Promise<StudentRecord> {
    const existing = this.students.get(record.id);
    const student: StudentRecord = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt,
    };
    this.students.set(student.id, structuredClone(student));
    return student;
  }

  async markStudentDeleted(studentId: string, deletedAt: string): Promise<StudentRecord> {
    const student = this.students.get(studentId);
    if (!student || student.deletedAt) throw new Error(`Active student not found: ${studentId}`);
    const deleted = { ...student, deletedAt, updatedAt: deletedAt };
    this.students.set(studentId, structuredClone(deleted));
    return deleted;
  }

  async upsertBook(
    record: Omit<BookRecord, "firstSemesterQuantity" | "secondSemesterQuantity">,
  ): Promise<BookRecord> {
    const existing = this.books.get(record.id);
    const book: BookRecord = {
      ...record,
      firstSemesterQuantity: existing?.firstSemesterQuantity ?? 0,
      secondSemesterQuantity: existing?.secondSemesterQuantity ?? 0,
      createdAt: existing?.createdAt ?? record.createdAt,
    };
    this.books.set(book.id, structuredClone(book));
    return book;
  }

  async updateBook(record: BookRecord): Promise<BookRecord> {
    this.books.set(record.id, structuredClone(record));
    return record;
  }

  async markBookDeleted(bookId: string, deletedAt: string): Promise<BookRecord> {
    const book = this.books.get(bookId);
    if (!book || book.deletedAt) throw new Error(`Active book not found: ${bookId}`);
    const deleted = { ...book, deletedAt, updatedAt: deletedAt };
    this.books.set(bookId, structuredClone(deleted));
    return deleted;
  }

  async insertTransaction(record: InventoryTransactionRecord): Promise<void> {
    this.transactions.set(record.id, structuredClone(record));
  }

  async insertTransactionItems(records: InventoryTransactionItemRecord[]): Promise<void> {
    for (const record of records) {
      this.transactionItems.set(record.id, structuredClone(record));
    }
  }

  async insertStudentBooks(records: StudentBookRecord[]): Promise<void> {
    for (const record of records) {
      this.studentBookRows.set(record.id, structuredClone(record));
    }
  }

  async markTransactionReversed(
    transactionId: string,
    reversedByTransactionId: string,
  ): Promise<InventoryTransactionRecord> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Unknown transaction: ${transactionId}`);
    }

    const updated = { ...transaction, reversedByTransactionId };
    this.transactions.set(updated.id, updated);
    return structuredClone(updated);
  }

  async markStudentBooksReversed(
    transactionId: string,
    reversedAt: string,
  ): Promise<StudentBookRecord[]> {
    const updatedRows: StudentBookRecord[] = [];
    for (const row of this.studentBookRows.values()) {
      if (row.issuedTransactionId === transactionId && !row.reversedAt) {
        const updated = { ...row, reversedAt };
        this.studentBookRows.set(updated.id, updated);
        updatedRows.push(structuredClone(updated));
      }
    }
    return updatedRows;
  }

  async recordChanges(changes: SyncChangeInput[]): Promise<void> {
    for (const change of changes) {
      this.changes.push({
        sequence: this.changes.length + 1,
        commandId: change.commandId,
        entityTable: change.entityTable,
        entityId: change.entityId,
        payloadJson: change.payloadJson,
        createdAt: change.createdAt,
      });
    }
  }

  async pull(since: number) {
    const changes = this.changes.filter((change) => change.sequence > since);
    return {
      changes: structuredClone(changes),
      nextCursor: String(changes.at(-1)?.sequence ?? since),
    };
  }

  private clone(): MemorySyncStore {
    const copy = new MemorySyncStore();
    copy.replaceWith(this);
    return copy;
  }

  private replaceWith(source: MemorySyncStore): void {
    replaceMap(this.academicYears, source.academicYears);
    replaceMap(this.students, source.students);
    replaceMap(this.books, source.books);
    replaceMap(this.transactions, source.transactions);
    replaceMap(this.transactionItems, source.transactionItems);
    replaceMap(this.studentBookRows, source.studentBookRows);
    this.changes.splice(0, this.changes.length, ...structuredClone(source.changes));
  }
}

function replaceMap<T>(target: Map<string, T>, source: Map<string, T>): void {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, structuredClone(value));
  }
}
