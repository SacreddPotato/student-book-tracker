import { describe, expect, it } from "vitest";

import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";
import { getTranslation } from "../i18n";
import { exportStudentsWorkbook } from "./excel-export";

const students: StudentRow[] = [
  {
    id: "student-1",
    scopeId: "global",
    name: "Mona Ahmed",
    governmentId: "29801011234567",
    educationStage: "primary",
    gradeLevel: "primary1",
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
    deletedAt: null,
  },
  {
    id: "student-2",
    scopeId: "global",
    name: "Omar Adel",
    governmentId: "29901011234567",
    educationStage: "primary",
    gradeLevel: "primary2",
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
    deletedAt: null,
  },
];

const books: BookRow[] = [
  {
    id: "book-math",
    scopeId: "global",
    name: "Primary Math",
    educationStage: "primary",
    quantity: 3,
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
    deletedAt: null,
  },
  {
    id: "book-science",
    scopeId: "global",
    name: "Primary Science",
    educationStage: "primary",
    quantity: 2,
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
    deletedAt: null,
  },
  {
    id: "book-kg",
    scopeId: "global",
    name: "KG Alphabet",
    educationStage: "kg",
    quantity: 5,
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
    deletedAt: null,
  },
];

describe("student Excel export", () => {
  it("creates English headers and marks issued books for the selected grade", () => {
    const workbook = exportStudentsWorkbook({
      students,
      books,
      selectedStage: "all",
      selectedGradeLevel: "primary1",
      language: "en",
      issuedBookIdsByStudentId: {
        "student-1": ["book-math"],
      },
    });

    const worksheet = workbook.getWorksheet("Students");
    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell("A1").value).toBe("Al-Gharbia");
    expect(worksheet?.getCell("A2").value).toBe("East Tanta Administrative Learning");
    expect(worksheet?.getCell("A3").value).toBe("Al-Rafii Schools");
    expect(worksheet?.getCell("D1").value).toBe("Primary");
    expect(worksheet?.getCell("D2").value).toBe("1st Primary");
    expect(worksheet?.getCell("D3").value).toBe("for the educational year:");

    expect(worksheet?.getCell("A5").value).toBe("name");
    expect(worksheet?.getCell("B5").value).toBe("Primary Math");
    expect(worksheet?.getCell("C5").value).toBe("Primary Science");
    expect(worksheet?.getCell("D5").value).toBe("student signature");
    expect(worksheet?.getCell("A6").value).toBe("Mona Ahmed");
    expect(worksheet?.getCell("B6").value).toBe("Issued");
    expect(worksheet?.getCell("C6").value).toBe("");
    expect(worksheet?.getCell("A7").value).toBeNull();
  });

  it("uses Arabic labels and RTL worksheet direction in Arabic mode", () => {
    const workbook = exportStudentsWorkbook({
      students,
      books,
      selectedStage: "primary",
      selectedGradeLevel: "primary1",
      language: "ar",
      issuedBookIdsByStudentId: {},
    });

    const worksheet = workbook.getWorksheet("Students");
    expect(worksheet?.views[0]?.rightToLeft).toBe(true);
    expect(worksheet?.getCell("A1").value).toBe(getTranslation("ar", "export.alGharbia"));
    expect(worksheet?.getCell("D1").value).toBe(getTranslation("ar", "stages.primary"));
    expect(worksheet?.getCell("D2").value).toBe(getTranslation("ar", "grades.primary1"));
    expect(worksheet?.getCell("D5").value).toBe(getTranslation("ar", "export.studentSignature"));
  });

  it("requires a concrete grade group before exporting", () => {
    expect(() =>
      exportStudentsWorkbook({
        students,
        books,
        selectedStage: "all",
        selectedGradeLevel: "all",
        language: "en",
        issuedBookIdsByStudentId: {},
      }),
    ).toThrow("Choose a grade group before exporting.");
  });
});
