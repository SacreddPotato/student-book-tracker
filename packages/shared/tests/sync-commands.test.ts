import { describe, expectTypeOf, it } from "vitest";

import type {
  AddBookStockCommand,
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
    >();
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
      | "VALIDATION_FAILED"
      | undefined
    >();
  });
});
