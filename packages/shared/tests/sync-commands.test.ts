import { describe, expectTypeOf, it } from "vitest";

import type {
  AddBookStockCommand,
  AdvanceAcademicYearCommand,
  DeleteBookCommand,
  DeleteStudentCommand,
  InitializeAcademicYearCommand,
  IssueBooksToStudentCommand,
  ReverseTransactionCommand,
  SyncCommand,
  SyncCommandResult,
  UpsertBookCommand,
  UpsertStudentCommand,
} from "../src/protocol/sync-commands";

describe("sync command contracts", () => {
  it("exposes the command union used by local outbox and sync API", () => {
    expectTypeOf<SyncCommand>().toEqualTypeOf<
      | AddBookStockCommand
      | IssueBooksToStudentCommand
      | ReverseTransactionCommand
      | UpsertStudentCommand
      | UpsertBookCommand
      | DeleteStudentCommand
      | DeleteBookCommand
      | InitializeAcademicYearCommand
      | AdvanceAcademicYearCommand
    >();
  });

  it("requires grade scope for book upserts and exposes deletion command shapes", () => {
    expectTypeOf<UpsertBookCommand["book"]["gradeLevel"]>().toEqualTypeOf<
      | "kg1"
      | "kg2"
      | "primary1"
      | "primary2"
      | "primary3"
      | "primary4"
      | "primary5"
      | "primary6"
      | "preparatory1"
      | "preparatory2"
      | "preparatory3"
    >();
    expectTypeOf<DeleteStudentCommand>().toMatchTypeOf<{
      id: string;
      type: "DELETE_STUDENT";
      deviceId: string;
      occurredAt: string;
      studentId: string;
      academicYear: string;
    }>();
    expectTypeOf<DeleteBookCommand>().toMatchTypeOf<{
      id: string;
      type: "DELETE_BOOK";
      deviceId: string;
      occurredAt: string;
      bookId: string;
    }>();
  });

  it("carries semester, receipt, and academic year inventory dimensions", () => {
    expectTypeOf<AddBookStockCommand["semester"]>().toEqualTypeOf<"first" | "second">();
    expectTypeOf<AddBookStockCommand["receiptNumber"]>().toEqualTypeOf<string>();
    expectTypeOf<AddBookStockCommand["receiptDate"]>().toEqualTypeOf<string>();
    expectTypeOf<IssueBooksToStudentCommand["bookSelections"]>().toEqualTypeOf<
      Array<{ bookId: string; semester: "first" | "second" }>
    >();
  });

  it("carries explicit promoted snapshots in academic year advancement", () => {
    expectTypeOf<AdvanceAcademicYearCommand["fromYear"]>().toEqualTypeOf<string>();
    expectTypeOf<AdvanceAcademicYearCommand["toYear"]>().toEqualTypeOf<string>();
    expectTypeOf<AdvanceAcademicYearCommand["promotedStudents"][number]>()
      .toHaveProperty("previousStudentId").toEqualTypeOf<string>();
  });

  it("exposes server command results with accepted, rejected, and duplicate statuses", () => {
    expectTypeOf<SyncCommandResult["status"]>().toEqualTypeOf<
      "accepted" | "rejected" | "duplicate"
    >();
    expectTypeOf<SyncCommandResult["reasonCode"]>().toEqualTypeOf<
      | "INSUFFICIENT_STOCK"
      | "TRANSACTION_ALREADY_REVERSED"
      | "UNKNOWN_STUDENT"
      | "UNKNOWN_BOOK"
      | "ACADEMIC_YEAR_NOT_INITIALIZED"
      | "ACADEMIC_YEAR_ALREADY_INITIALIZED"
      | "ACADEMIC_YEAR_MISMATCH"
      | "ACADEMIC_YEAR_ARCHIVED"
      | "VALIDATION_FAILED"
      | undefined
    >();
  });
});
