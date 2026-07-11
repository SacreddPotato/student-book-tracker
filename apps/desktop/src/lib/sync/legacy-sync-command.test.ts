import { describe, expect, it } from "vitest";

import type {
  LegacyAddBookStockCommand,
  LegacyIssueBooksToStudentCommand,
  LegacySyncCommand,
} from "./legacy-sync-command";

describe("legacy sync command contract", () => {
  it("preserves the rollback frontend's pre-academic-year payloads", () => {
    const stock: LegacyAddBookStockCommand = {
      id: "stock-command",
      type: "ADD_BOOK_STOCK",
      deviceId: "legacy-device",
      occurredAt: "2026-07-11T10:00:00.000Z",
      bookId: "book-1",
      quantity: 3,
    };
    const issue: LegacyIssueBooksToStudentCommand = {
      id: "issue-command",
      type: "ISSUE_BOOKS_TO_STUDENT",
      deviceId: "legacy-device",
      occurredAt: "2026-07-11T10:00:00.000Z",
      studentId: "student-1",
      bookIds: ["book-1"],
    };
    const commands: LegacySyncCommand[] = [stock, issue];

    expect(commands.map(({ type }) => type)).toEqual([
      "ADD_BOOK_STOCK",
      "ISSUE_BOOKS_TO_STUDENT",
    ]);
    expect(stock).not.toHaveProperty("academicYear");
    expect(issue).toHaveProperty("bookIds", ["book-1"]);
  });
});
