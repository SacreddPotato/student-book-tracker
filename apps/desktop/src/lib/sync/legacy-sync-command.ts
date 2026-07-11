import type { EducationStage, GradeLevel } from "@app/shared";

type LegacyCommandBase = {
  id: string;
  deviceId: string;
  occurredAt: string;
};

export type LegacyAddBookStockCommand = LegacyCommandBase & {
  type: "ADD_BOOK_STOCK";
  bookId: string;
  quantity: number;
};

export type LegacyIssueBooksToStudentCommand = LegacyCommandBase & {
  type: "ISSUE_BOOKS_TO_STUDENT";
  studentId: string;
  bookIds: string[];
};

export type LegacyReverseTransactionCommand = LegacyCommandBase & {
  type: "REVERSE_TRANSACTION";
  transactionId: string;
};

export type LegacyUpsertStudentCommand = LegacyCommandBase & {
  type: "UPSERT_STUDENT";
  student: {
    id: string;
    name: string;
    governmentId: string;
    educationStage: EducationStage;
    gradeLevel: GradeLevel;
  };
};

export type LegacyUpsertBookCommand = LegacyCommandBase & {
  type: "UPSERT_BOOK";
  book: {
    id: string;
    name: string;
    educationStage: EducationStage;
  };
};

/**
 * Frozen protocol used only by the preserved Svelte rollback frontend.
 * The active React frontend uses the current shared SyncCommand contract.
 */
export type LegacySyncCommand =
  | LegacyAddBookStockCommand
  | LegacyIssueBooksToStudentCommand
  | LegacyReverseTransactionCommand
  | LegacyUpsertStudentCommand
  | LegacyUpsertBookCommand;
