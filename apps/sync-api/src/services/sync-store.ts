import { and, eq, inArray, isNull, or } from "drizzle-orm";

import type { SyncDatabase } from "../db/client";
import {
  academicYears,
  books,
  inventoryTransactionItems,
  inventoryTransactions,
  students,
  studentBooks,
  syncChanges,
} from "../db/schema";

export type AcademicYearRecord = typeof academicYears.$inferSelect;
export type StudentRecord = typeof students.$inferSelect;
export type BookRecord = typeof books.$inferSelect;
export type InventoryTransactionRecord = typeof inventoryTransactions.$inferSelect;
export type InventoryTransactionItemRecord = typeof inventoryTransactionItems.$inferSelect;
export type StudentBookRecord = typeof studentBooks.$inferSelect;
export type SyncChangeInput = Omit<typeof syncChanges.$inferInsert, "sequence">;

export interface SyncStoreTransaction {
  hasAppliedCommand(commandId: string): Promise<boolean>;
  getCurrentAcademicYearForUpdate(): Promise<AcademicYearRecord | null>;
  insertAcademicYear(record: AcademicYearRecord): Promise<AcademicYearRecord>;
  archiveAcademicYear(academicYear: string, archivedAt: string): Promise<AcademicYearRecord>;
  listStudentsForAcademicYear(academicYear: string): Promise<StudentRecord[]>;
  getStudent(studentId: string): Promise<StudentRecord | null>;
  getBooksForUpdate(bookIds: string[]): Promise<BookRecord[]>;
  getTransactionForUpdate(transactionId: string): Promise<InventoryTransactionRecord | null>;
  getTransactionItems(transactionId: string): Promise<InventoryTransactionItemRecord[]>;
  upsertStudent(record: StudentRecord): Promise<StudentRecord>;
  markStudentDeleted(studentId: string, deletedAt: string): Promise<StudentRecord>;
  upsertBook(
    record: Omit<BookRecord, "firstSemesterQuantity" | "secondSemesterQuantity">,
  ): Promise<BookRecord>;
  markBookDeleted(bookId: string, deletedAt: string): Promise<BookRecord>;
  updateBook(record: BookRecord): Promise<BookRecord>;
  insertTransaction(record: InventoryTransactionRecord): Promise<void>;
  insertTransactionItems(records: InventoryTransactionItemRecord[]): Promise<void>;
  insertStudentBooks(records: StudentBookRecord[]): Promise<void>;
  markTransactionReversed(
    transactionId: string,
    reversedByTransactionId: string,
  ): Promise<InventoryTransactionRecord>;
  markStudentBooksReversed(
    transactionId: string,
    reversedAt: string,
  ): Promise<StudentBookRecord[]>;
  recordChanges(changes: SyncChangeInput[]): Promise<void>;
}

export interface SyncStore {
  transaction<T>(operation: (transaction: SyncStoreTransaction) => Promise<T>): Promise<T>;
}

export class DrizzleSyncStore implements SyncStore {
  constructor(private readonly database: SyncDatabase) {}

  async transaction<T>(operation: (transaction: SyncStoreTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (transaction) =>
      operation(new DrizzleSyncStoreTransaction(transaction as unknown as SyncDatabase)));
  }
}

class DrizzleSyncStoreTransaction implements SyncStoreTransaction {
  constructor(private readonly database: SyncDatabase) {}

  async hasAppliedCommand(commandId: string): Promise<boolean> {
    const [change] = await this.database
      .select({ commandId: syncChanges.commandId })
      .from(syncChanges)
      .where(eq(syncChanges.commandId, commandId))
      .limit(1);
    return Boolean(change);
  }

  async getCurrentAcademicYearForUpdate(): Promise<AcademicYearRecord | null> {
    const [row] = await this.database
      .select()
      .from(academicYears)
      .where(eq(academicYears.status, "current"))
      .limit(1)
      .for("update");
    return row ?? null;
  }

  async insertAcademicYear(record: AcademicYearRecord): Promise<AcademicYearRecord> {
    const [row] = await this.database.insert(academicYears).values(record).returning();
    return row;
  }

  async archiveAcademicYear(
    academicYear: string,
    archivedAt: string,
  ): Promise<AcademicYearRecord> {
    const [row] = await this.database
      .update(academicYears)
      .set({ status: "archived", archivedAt })
      .where(and(
        eq(academicYears.academicYear, academicYear),
        eq(academicYears.status, "current"),
      ))
      .returning();
    if (!row) throw new Error(`Current academic year not found: ${academicYear}`);
    return row;
  }

  async listStudentsForAcademicYear(academicYear: string): Promise<StudentRecord[]> {
    return this.database
      .select()
      .from(students)
      .where(and(eq(students.academicYear, academicYear), isNull(students.deletedAt)))
      .orderBy(students.id);
  }

  async getStudent(studentId: string): Promise<StudentRecord | null> {
    const [student] = await this.database
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), isNull(students.deletedAt)))
      .limit(1);
    return student ?? null;
  }

  async getBooksForUpdate(bookIds: string[]): Promise<BookRecord[]> {
    if (bookIds.length === 0) return [];
    return this.database
      .select()
      .from(books)
      .where(and(inArray(books.id, [...bookIds].sort()), isNull(books.deletedAt)))
      .orderBy(books.id)
      .for("update");
  }

  async getTransactionForUpdate(
    transactionId: string,
  ): Promise<InventoryTransactionRecord | null> {
    const [transaction] = await this.database
      .select()
      .from(inventoryTransactions)
      .where(or(
        eq(inventoryTransactions.id, transactionId),
        eq(inventoryTransactions.commandId, transactionId),
      ))
      .limit(1)
      .for("update");
    return transaction ?? null;
  }

  async getTransactionItems(transactionId: string) {
    return this.database
      .select()
      .from(inventoryTransactionItems)
      .where(eq(inventoryTransactionItems.transactionId, transactionId))
      .orderBy(inventoryTransactionItems.id);
  }

  async upsertStudent(record: StudentRecord): Promise<StudentRecord> {
    const [student] = await this.database
      .insert(students)
      .values(record)
      .onConflictDoUpdate({
        target: students.id,
        set: {
          name: record.name,
          governmentId: record.governmentId,
          educationStage: record.educationStage,
          gradeLevel: record.gradeLevel,
          academicYear: record.academicYear,
          previousStudentId: record.previousStudentId,
          updatedAt: record.updatedAt,
          deletedAt: null,
        },
      })
      .returning();
    return student;
  }

  async markStudentDeleted(studentId: string, deletedAt: string): Promise<StudentRecord> {
    const [student] = await this.database
      .update(students)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(students.id, studentId), isNull(students.deletedAt)))
      .returning();
    if (!student) throw new Error(`Active student not found: ${studentId}`);
    return student;
  }

  async upsertBook(
    record: Omit<BookRecord, "firstSemesterQuantity" | "secondSemesterQuantity">,
  ): Promise<BookRecord> {
    const [book] = await this.database
      .insert(books)
      .values({ ...record, firstSemesterQuantity: 0, secondSemesterQuantity: 0 })
      .onConflictDoUpdate({
        target: books.id,
        set: {
          name: record.name,
          educationStage: record.educationStage,
          gradeLevel: record.gradeLevel,
          updatedAt: record.updatedAt,
          deletedAt: null,
        },
      })
      .returning();
    return book;
  }

  async markBookDeleted(bookId: string, deletedAt: string): Promise<BookRecord> {
    const [book] = await this.database
      .update(books)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(books.id, bookId), isNull(books.deletedAt)))
      .returning();
    if (!book) throw new Error(`Active book not found: ${bookId}`);
    return book;
  }

  async updateBook(record: BookRecord): Promise<BookRecord> {
    const [book] = await this.database
      .update(books)
      .set({
        firstSemesterQuantity: record.firstSemesterQuantity,
        secondSemesterQuantity: record.secondSemesterQuantity,
        updatedAt: record.updatedAt,
      })
      .where(eq(books.id, record.id))
      .returning();
    return book;
  }

  async insertTransaction(record: InventoryTransactionRecord): Promise<void> {
    await this.database.insert(inventoryTransactions).values(record);
  }

  async insertTransactionItems(records: InventoryTransactionItemRecord[]): Promise<void> {
    if (records.length) await this.database.insert(inventoryTransactionItems).values(records);
  }

  async insertStudentBooks(records: StudentBookRecord[]): Promise<void> {
    if (records.length) await this.database.insert(studentBooks).values(records);
  }

  async markTransactionReversed(transactionId: string, reversedByTransactionId: string) {
    const [transaction] = await this.database
      .update(inventoryTransactions)
      .set({ reversedByTransactionId })
      .where(eq(inventoryTransactions.id, transactionId))
      .returning();
    return transaction;
  }

  async markStudentBooksReversed(transactionId: string, reversedAt: string) {
    return this.database
      .update(studentBooks)
      .set({ reversedAt })
      .where(and(
        eq(studentBooks.issuedTransactionId, transactionId),
        isNull(studentBooks.reversedAt),
      ))
      .returning();
  }

  async recordChanges(changes: SyncChangeInput[]): Promise<void> {
    if (changes.length) await this.database.insert(syncChanges).values(changes);
  }
}
