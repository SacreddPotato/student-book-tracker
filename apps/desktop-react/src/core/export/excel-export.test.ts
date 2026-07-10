import { describe, expect, it } from "vitest";

import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";
import { buildStudentsWorkbook } from "./excel-export";

const now = "2026-07-08T10:00:00.000Z";
const students: StudentRow[] = [{
  id: "student-1", scopeId: "global", name: "Mona Ahmed",
  governmentId: "29801011234567", educationStage: "primary",
  gradeLevel: "primary1", createdAt: now, updatedAt: now, deletedAt: null,
}];
const books: BookRow[] = [{
  id: "book-1", scopeId: "global", name: "Primary Math",
  educationStage: "primary", quantity: 2, createdAt: now,
  updatedAt: now, deletedAt: null,
}];

describe("student Excel export", () => {
  it("exports only the selected grade and marks issued books", () => {
    const workbook = buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "primary1",
      language: "en",
      issuedBookIdsByStudentId: { "student-1": ["book-1"] },
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
    expect(worksheet.getCell(6, 2).value).toBe("Issued");
  });

  it("uses an RTL worksheet in Arabic", () => {
    const workbook = buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "primary1",
      language: "ar",
      issuedBookIdsByStudentId: {},
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
      issuedBookIdsByStudentId: {},
      translate: (key) => key,
    })).toThrow("Choose a grade group");
  });
});
