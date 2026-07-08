import { describe, expect, it } from "vitest";

import { bookCanBeIssuedToStudent } from "../src/domain/inventory";

describe("inventory domain", () => {
  it("allows issuing a book to a student in the same education stage", () => {
    expect(
      bookCanBeIssuedToStudent(
        { id: "book-1", educationStage: "primary" },
        { id: "student-1", educationStage: "primary" },
      ),
    ).toBe(true);
  });

  it("prevents issuing a book to a student in a different education stage", () => {
    expect(
      bookCanBeIssuedToStudent(
        { id: "book-1", educationStage: "primary" },
        { id: "student-1", educationStage: "preparatory" },
      ),
    ).toBe(false);
  });
});
