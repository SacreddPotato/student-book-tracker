import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";
import { getTranslation, type TranslationKey } from "../i18n";
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
  educationStage: "primary", gradeLevel: "primary1",
  firstSemesterQuantity: 2, secondSemesterQuantity: 2, createdAt: now,
  updatedAt: now, deletedAt: null,
}, {
  id: "book-primary2", scopeId: "global", name: "Primary 2 Math",
  educationStage: "primary", gradeLevel: "primary2",
  firstSemesterQuantity: 2, secondSemesterQuantity: 2, createdAt: now,
  updatedAt: now, deletedAt: null,
}];

function expectThinBorder(cell: ExcelJS.Cell) {
  expect(cell.border).toMatchObject({
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  });
}

describe("student Excel export", () => {
  it("centers the full Arabic grade and selected academic year in a two-line header", () => {
    const preparatoryStudent: StudentRow = {
      ...students[0],
      id: "student-preparatory2",
      name: "أحمد علي",
      educationStage: "preparatory",
      gradeLevel: "preparatory2",
    };
    const preparatoryBook: BookRow = {
      ...books[0],
      id: "book-preparatory2",
      name: "اللغة العربية",
      educationStage: "preparatory",
      gradeLevel: "preparatory2",
    };
    const workbook = buildStudentsWorkbook({
      students: [preparatoryStudent],
      books: [preparatoryBook],
      gradeLevel: "preparatory2",
      academicYear: "2025-2026",
      language: "ar",
      issuedBookSelectionsByStudentId: {},
      translate: (key, values) => ({
        "export.name": "الاسم",
        "export.alGharbia": "الغربية",
        "export.eastTantaAdministrativeLearning": "إدارة شرق طنطا التعليمية",
        "export.alRafiiSchools": "مدرسة الرافعي الرسمية للغات",
        "export.gradeHeading": `الصف ${values?.grade}`,
        "export.educationalYear": `للعام الدراسي: ${values?.year}`,
        "export.studentSignature": "توقيع الطالب",
        "stages.preparatory": "الإعدادي",
        "grades.preparatory2": "الثاني الإعدادي",
      })[key] ?? key,
    });
    const worksheet = workbook.getWorksheet("Students")!;

    expect(worksheet.model.merges).toEqual(expect.arrayContaining(["C1:F1", "C2:F2"]));
    expect(worksheet.getCell("C1").value).toBe("الصف الثاني الإعدادي");
    expect(worksheet.getCell("C2").value).toBe("للعام الدراسي: \u200E2025-2026\u200E");
    expect(worksheet.getCell("C1").font).toMatchObject({ bold: true, size: 14 });
    expect(worksheet.getCell("C2").font).toMatchObject({ bold: true, size: 12 });
  });

  it("exports only the selected grade and marks issued books", () => {
    const workbook = buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "primary1",
      academicYear: "2025-2026",
      language: "en",
      issuedBookSelectionsByStudentId: { "student-1": [
        { bookId: "book-1", semester: "first" },
        { bookId: "book-1", semester: "second" },
      ] },
      translate: (key, values) => ({
        "export.name": "name",
        "export.alGharbia": "Al-Gharbia",
        "export.eastTantaAdministrativeLearning": "East Tanta",
        "export.alRafiiSchools": "Al-Rafii Schools",
        "export.gradeHeading": String(values?.grade),
        "export.educationalYear": `Educational year: ${values?.year}`,
        "export.studentSignature": "student signature",
        "students.issued": "Issued",
        "stages.primary": "Primary",
        "grades.primary1": "1st Primary",
      })[key] ?? key,
    });
    const worksheet = workbook.getWorksheet("Students")!;

    expect(worksheet.views[0]?.rightToLeft).toBe(false);
    expect(worksheet.getCell("A1").alignment).toMatchObject({
      horizontal: "left", readingOrder: "ltr", vertical: "middle",
    });
    expect(worksheet.getCell("A1").value).toBe("Al-Gharbia");
    expect(worksheet.getCell("C2").value).toBe("Educational year: 2025-2026");
    expect(worksheet.getCell(6, 1).value).toBe("Mona Ahmed");
    expect(worksheet.getCell(6, 2).value).toBe("2");
    expect(worksheet.getCell(5, 3).value).toBe("student signature");
  });

  it("persists RTL reading order and cell-specific alignment in Arabic", async () => {
    const arabicStudent = { ...students[0], name: "أحمد علي" };
    const arabicBook = { ...books[0], name: "اللغة العربية" };
    const workbook = buildStudentsWorkbook({
      students: [arabicStudent],
      books: [arabicBook],
      gradeLevel: "primary1",
      academicYear: "2025-2026",
      language: "ar",
      issuedBookSelectionsByStudentId: {},
      translate: (key, values) => getTranslation("ar", key as TranslationKey, values),
    });
    const data = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(data);
    const worksheet = restored.getWorksheet("Students")!;

    expect(worksheet.views[0]?.rightToLeft).toBe(true);
    expect(worksheet.getCell("A1").alignment).toMatchObject({
      horizontal: "right", readingOrder: "rtl", vertical: "middle",
    });
    expect(worksheet.getCell("C1").alignment).toMatchObject({
      horizontal: "center", readingOrder: "rtl", vertical: "middle",
    });
    expect(worksheet.getCell("A5").alignment).toMatchObject({
      horizontal: "center", readingOrder: "rtl", vertical: "middle",
    });
    expect(worksheet.getCell("A6").alignment).toMatchObject({
      horizontal: "right", readingOrder: "rtl", vertical: "middle",
    });
    expect(worksheet.getCell("B6").alignment).toMatchObject({
      horizontal: "center", readingOrder: "rtl", vertical: "middle",
    });
  });

  it("extends a bordered table through the full printable width", async () => {
    const workbook = buildStudentsWorkbook({
      students: [students[0], { ...students[0], id: "student-2", name: "Omar Ali" }],
      books: [books[0]],
      gradeLevel: "primary1",
      academicYear: "2025-2026",
      language: "en",
      issuedBookSelectionsByStudentId: {},
      translate: (key) => key,
    });
    const data = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(data);
    const worksheet = restored.getWorksheet("Students")!;

    expect(worksheet.model.merges).toEqual(expect.arrayContaining([
      "C5:H5", "C6:H6", "C7:H7",
    ]));
    for (const address of ["A5", "B5", "C5", "A6", "B6", "C6", "A7", "B7", "C7"]) {
      expectThinBorder(worksheet.getCell(address));
    }
    expect(worksheet.getCell("A4").border).toBeUndefined();
  });

  it("borders a wide table without a redundant signature merge", async () => {
    const manyBooks = Array.from({ length: 8 }, (_, index): BookRow => ({
      ...books[0],
      id: `book-${index + 1}`,
      name: `Book ${index + 1}`,
    }));
    const workbook = buildStudentsWorkbook({
      students,
      books: manyBooks,
      gradeLevel: "primary1",
      academicYear: "2025-2026",
      language: "en",
      issuedBookSelectionsByStudentId: {},
      translate: (key) => key === "export.studentSignature" ? "student signature" : key,
    });
    const data = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(data);
    const worksheet = restored.getWorksheet("Students")!;

    expect(worksheet.model.merges).not.toContain("J5:J5");
    expect(worksheet.getCell("J5").value).toBe("student signature");
    for (let column = 1; column <= 10; column += 1) {
      expectThinBorder(worksheet.getCell(5, column));
      expectThinBorder(worksheet.getCell(6, column));
    }
    expect(worksheet.pageSetup.printArea).toBe("A1:J6");
  });

  it("keeps a wide subject header symmetric and configures one-page-width printing", () => {
    const manyBooks = Array.from({ length: 8 }, (_, index): BookRow => ({
      ...books[0],
      id: `book-${index + 1}`,
      name: `Book ${index + 1}`,
    }));
    const workbook = buildStudentsWorkbook({
      students,
      books: manyBooks,
      gradeLevel: "primary1",
      academicYear: "2025-2026",
      language: "en",
      issuedBookSelectionsByStudentId: {},
      translate: (key, values) => ({
        "export.name": "name",
        "export.alGharbia": "Al-Gharbia",
        "export.eastTantaAdministrativeLearning": "East Tanta",
        "export.alRafiiSchools": "Al-Rafii Schools",
        "export.gradeHeading": String(values?.grade),
        "export.educationalYear": `Educational year: ${values?.year}`,
        "export.studentSignature": "student signature",
        "grades.primary1": "1st Primary",
      })[key] ?? key,
    });
    const worksheet = workbook.getWorksheet("Students")!;

    expect(worksheet.model.merges).toEqual(expect.arrayContaining([
      "A1:C1", "A2:C2", "A3:C3", "D1:G1", "D2:G2", "H1:J3",
    ]));
    expect(worksheet.pageSetup).toMatchObject({
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printArea: "A1:J6",
    });
  });

  it("requires a concrete grade", () => {
    expect(() => buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "all",
      academicYear: "2025-2026",
      language: "en",
      issuedBookSelectionsByStudentId: {},
      translate: (key) => key,
    })).toThrow("Choose a grade group");
  });

  it("writes the exact numerical semester issuance states", () => {
    const statuses = [
      { selections: [{ bookId: "book-1", semester: "first" as const }], expected: "1" },
      { selections: [{ bookId: "book-1", semester: "second" as const }], expected: "1" },
      { selections: [{ bookId: "book-1", semester: "first" as const }, { bookId: "book-1", semester: "second" as const }], expected: "2" },
      { selections: [], expected: "0" },
    ];
    for (const { selections, expected } of statuses) {
      const workbook = buildStudentsWorkbook({
        students, books, gradeLevel: "primary1", academicYear: "2025-2026", language: "en",
        issuedBookSelectionsByStudentId: { "student-1": selections },
        translate: (key) => key,
      });
      expect(workbook.getWorksheet("Students")!.getCell(6, 2).value || null).toBe(expected);
    }
  });
});
