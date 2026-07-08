import type { EducationStage, GradeLevel } from "../domain/education";

export type SyncCommand =
  | AddBookStockCommand
  | IssueBooksToStudentCommand
  | ReverseTransactionCommand
  | UpsertStudentCommand
  | UpsertBookCommand;

export type AddBookStockCommand = {
  id: string;
  type: "ADD_BOOK_STOCK";
  deviceId: string;
  occurredAt: string;
  bookId: string;
  quantity: number;
};

export type IssueBooksToStudentCommand = {
  id: string;
  type: "ISSUE_BOOKS_TO_STUDENT";
  deviceId: string;
  occurredAt: string;
  studentId: string;
  bookIds: string[];
};

export type ReverseTransactionCommand = {
  id: string;
  type: "REVERSE_TRANSACTION";
  deviceId: string;
  occurredAt: string;
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
  };
};

export type SyncCommandResult = {
  commandId: string;
  status: "accepted" | "rejected" | "duplicate";
  reasonCode?:
    | "INSUFFICIENT_STOCK"
    | "TRANSACTION_ALREADY_REVERSED"
    | "UNKNOWN_STUDENT"
    | "UNKNOWN_BOOK"
    | "VALIDATION_FAILED";
  message?: string;
};
