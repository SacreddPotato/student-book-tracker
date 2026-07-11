import { describe, expect, it } from "vitest";

import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";
import { buildStudentsWorkbook } from "./excel-export";

const now = "2026-07-08T10:00:00.000Z";
const students: StudentRow[] = [{
  id: "student-1", scopeId: "global", name: "Mona Ahmed",
  governmentId: "29801011234567", educationStage: "primary",
  gradeLevel: "primary1", academicYear: "2025-2026", previousStudentId: null,
  createdAt: now, updatedAt: now, deletedAt: null,
}];
const books: BookRow[] = [{
  id: "book-1", scopeId: "global", name: "Primary Math",
  educationStage: "primary", firstSemesterQuantity: 2, secondSemesterQuantity: 2, createdAt: now,
  updatedAt: now, deletedAt: null,
}];

describe("student Excel export", () => {
  it("exports only the selected grade and marks issued books", () => {
    const workbook = buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "primary1",
      language: "en",
      issuedBookSelectionsByStudentId: { "student-1": [
        { bookId: "book-1", semester: "first" },
        { bookId: "book-1", semester: "second" },
      ] },
      translate: (key) => ({
        "export.name": "name",
        "export.alGharbia": "Al-Gharbia",
        "export.eastTantaAdministrativeLearning": "East Tanta",
        "export.alRafiiSchools": "Al-Rafii Schools",
        "export.educationalYear": "Educational year",
        "export.studentSignature": "student signature",
        "students.issued": "Issued",
        "stages.primary": "Primary",
        "grades.primary1": "1st Primary",
      })[key] ?? key,
    });
    const worksheet = workbook.getWorksheet("Students")!;

    expect(worksheet.getCell("A1").value).toBe("Al-Gharbia");
    expect(worksheet.getCell(6, 1).value).toBe("Mona Ahmed");
    expect(worksheet.getCell(6, 2).value).toBe("Both semesters issued");
  });

  it("uses an RTL worksheet in Arabic", () => {
    const workbook = buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "primary1",
      language: "ar",
      issuedBookSelectionsByStudentId: {},
      translate: (key) => key,
    });

    expect(workbook.getWorksheet("Students")?.views[0]?.rightToLeft).toBe(true);
  });

  it("requires a concrete grade", () => {
    expect(() => buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "all",
      language: "en",
      issuedBookSelectionsByStudentId: {},
      translate: (key) => key,
    })).toThrow("Choose a grade group");
  });

  it("writes the exact semester issuance states and leaves neither blank", () => {
    const statuses = [
      { selections: [{ bookId: "book-1", semester: "first" as const }], expected: "1" },
      { selections: [{ bookId: "book-1", semester: "second" as const }], expected: "1" },
      { selections: [{ bookId: "book-1", semester: "first" as const }, { bookId: "book-1", semester: "second" as const }], expected: "2" },
      { selections: [], expected: null },
    ];
    for (const { selections, expected } of statuses) {
      const workbook = buildStudentsWorkbook({
        students, books, gradeLevel: "primary1", language: "en",
        issuedBookSelectionsByStudentId: { "student-1": selections },
        translate: (key) => key,
      });
      expect(workbook.getWorksheet("Students")!.getCell(6, 2).value || null).toBe(expected);
    }
  });
});
