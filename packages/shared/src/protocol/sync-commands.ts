import type { EducationStage, GradeLevel } from "../domain/education";
import type { BookSelection, BookSemester } from "../domain/inventory";

export type SyncCommand =
  | AddBookStockCommand
  | IssueBooksToStudentCommand
  | ReverseTransactionCommand
  | UpsertStudentCommand
  | UpsertBookCommand
  | DeleteStudentCommand
  | DeleteBookCommand
  | InitializeAcademicYearCommand
  | AdvanceAcademicYearCommand;

export type AddBookStockCommand = {
  id: string;
  type: "ADD_BOOK_STOCK";
  deviceId: string;
  occurredAt: string;
  academicYear: string;
  bookId: string;
  semester: BookSemester;
  quantity: number;
  receiptNumber: string;
  receiptDate: string;
};

export type IssueBooksToStudentCommand = {
  id: string;
  type: "ISSUE_BOOKS_TO_STUDENT";
  deviceId: string;
  occurredAt: string;
  academicYear: string;
  studentId: string;
  bookSelections: BookSelection[];
};

export type ReverseTransactionCommand = {
  id: string;
  type: "REVERSE_TRANSACTION";
  deviceId: string;
  occurredAt: string;
  academicYear: string;
  transactionId: string;
};

export type UpsertStudentCommand = {
  id: string;
  type: "UPSERT_STUDENT";
  deviceId: string;
  occurredAt: string;
  student: {
    id: string;
    name: string;
    governmentId: string;
    educationStage: EducationStage;
    gradeLevel: GradeLevel;
    academicYear: string;
    previousStudentId: string | null;
  };
};

export type UpsertBookCommand = {
  id: string;
  type: "UPSERT_BOOK";
  deviceId: string;
  occurredAt: string;
  book: {
    id: string;
    name: string;
    educationStage: EducationStage;
    gradeLevel: GradeLevel;
  };
};

export type DeleteStudentCommand = {
  id: string;
  type: "DELETE_STUDENT";
  deviceId: string;
  occurredAt: string;
  studentId: string;
  academicYear: string;
};

export type DeleteBookCommand = {
  id: string;
  type: "DELETE_BOOK";
  deviceId: string;
  occurredAt: string;
  bookId: string;
};

export type InitializeAcademicYearCommand = {
  id: string;
  type: "INITIALIZE_ACADEMIC_YEAR";
  deviceId: string;
  occurredAt: string;
  academicYear: string;
};

export type PromotedStudentSnapshot = {
  id: string;
  previousStudentId: string;
  name: string;
  governmentId: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
  academicYear: string;
};

export type AdvanceAcademicYearCommand = {
  id: string;
  type: "ADVANCE_ACADEMIC_YEAR";
  deviceId: string;
  occurredAt: string;
  fromYear: string;
  toYear: string;
  promotedStudents: PromotedStudentSnapshot[];
};

export type SyncCommandResult = {
  commandId: string;
  status: "accepted" | "rejected" | "duplicate";
  reasonCode?:
    | "INSUFFICIENT_STOCK"
    | "TRANSACTION_ALREADY_REVERSED"
    | "UNKNOWN_STUDENT"
    | "UNKNOWN_BOOK"
    | "ACADEMIC_YEAR_NOT_INITIALIZED"
    | "ACADEMIC_YEAR_ALREADY_INITIALIZED"
    | "ACADEMIC_YEAR_MISMATCH"
    | "ACADEMIC_YEAR_ARCHIVED"
    | "VALIDATION_FAILED";
  message?: string;
};
