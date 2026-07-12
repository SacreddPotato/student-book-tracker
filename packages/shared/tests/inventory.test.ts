import { describe, expect, it } from "vitest";

import { bookCanBeIssuedToStudent, bookSemesters } from "../src/domain/inventory";

describe("inventory domain", () => {
  it("defines the two supported semesters in canonical order", () => {
    expect(bookSemesters).toEqual(["first", "second"]);
  });

  it("allows issuing a book to a student in the same education stage and grade", () => {
    expect(
      bookCanBeIssuedToStudent(
        { id: "book-1", educationStage: "primary", gradeLevel: "primary1" },
        { id: "student-1", educationStage: "primary", gradeLevel: "primary1" },
      ),
    ).toBe(true);
  });

  it("prevents issuing a book to a student in a different grade", () => {
    expect(
      bookCanBeIssuedToStudent(
        { id: "book-1", educationStage: "primary", gradeLevel: "primary1" },
        { id: "student-1", educationStage: "primary", gradeLevel: "primary2" },
      ),
    ).toBe(false);
  });

  it("prevents issuing a book to a student in a different education stage", () => {
    expect(
      bookCanBeIssuedToStudent(
        { id: "book-1", educationStage: "primary", gradeLevel: "primary1" },
        { id: "student-1", educationStage: "preparatory", gradeLevel: "preparatory1" },
      ),
    ).toBe(false);
  });
});
