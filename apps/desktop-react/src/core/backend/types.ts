import type { EducationStage, GradeLevel } from "@app/shared";

import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";
import type {
  InventoryTransactionItemRow,
  InventoryTransactionRow,
  StudentBookRow,
} from "../db/repositories/transactions";
import type { AddBookStockInput, IssueBooksToStudentInput } from "../services/inventory-service";
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

export type AppBackend = {
  initialize(): Promise<void>;
  listStudents(): Promise<StudentRow[]>;
  saveStudent(input: StudentInput): Promise<StudentRow>;
  listBooks(): Promise<BookRow[]>;
  saveBook(input: BookInput): Promise<BookRow>;
  listIssuedBooks(studentId: string): Promise<StudentBookRow[]>;
  addStock(input: AddBookStockInput): Promise<void>;
  issueBooks(input: IssueBooksToStudentInput): Promise<void>;
  listLogs(): Promise<LogEntry[]>;
  reverseTransaction(transactionId: string): Promise<void>;
  listConflicts(): Promise<SyncConflict[]>;
  acknowledgeConflict(commandId: string): Promise<void>;
  requestSync(): Promise<void>;
  syncStore: ExternalStore<SyncStatus>;
  updater: UpdaterController;
};
