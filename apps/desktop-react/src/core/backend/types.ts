import type { EducationStage, GradeLevel } from "@app/shared";

import type { BookRow } from "../db/repositories/books";
import type { AcademicYearRow } from "../db/repositories/academic-years";
import type { StudentRow } from "../db/repositories/students";
import type {
  InventoryTransactionItemRow,
  InventoryTransactionRow,
  StudentBookRow,
  BookHistoryEventRow,
} from "../db/repositories/transactions";
import type { AddBookStockInput, IssueBooksToStudentInput } from "../services/inventory-service";
import type { AcademicYearAdvanceResult } from "../services/academic-year-service";
import type { ExternalStore } from "../state/external-store";
import type { SyncConflict } from "../sync/conflicts";
import type { SyncStatus } from "../sync/sync-engine";
import type { UpdaterController } from "../updater/updater-controller";

export type StudentInput = {
  id?: string;
  name: string;
  governmentId: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
  academicYear: string;
};

export type BookInput = {
  id?: string;
  name: string;
  educationStage: EducationStage;
};

export type LogItem = InventoryTransactionItemRow & { bookName: string };
export type LogEntry = InventoryTransactionRow & {
  studentName: string | null;
  items: LogItem[];
};
export type BookHistoryEvent = BookHistoryEventRow;

export type AppBackend = {
  initialize(): Promise<void>;
  listAcademicYears(): Promise<AcademicYearRow[]>;
  initializeAcademicYear(academicYear: string): Promise<void>;
  advanceAcademicYear(toYear: string): Promise<AcademicYearAdvanceResult>;
  listStudents(academicYear: string): Promise<StudentRow[]>;
  saveStudent(input: StudentInput): Promise<StudentRow>;
  listBooks(): Promise<BookRow[]>;
  listBookHistory(bookId: string): Promise<BookHistoryEvent[]>;
  saveBook(input: BookInput): Promise<BookRow>;
  listIssuedBooks(academicYear: string, studentId: string): Promise<StudentBookRow[]>;
  addStock(input: AddBookStockInput): Promise<void>;
  issueBooks(input: IssueBooksToStudentInput): Promise<void>;
  listLogs(academicYear: string): Promise<LogEntry[]>;
  reverseTransaction(academicYear: string, transactionId: string): Promise<void>;
  listConflicts(): Promise<SyncConflict[]>;
  acknowledgeConflict(commandId: string): Promise<void>;
  requestSync(): Promise<void>;
  syncStore: ExternalStore<SyncStatus>;
  updater: UpdaterController;
};
