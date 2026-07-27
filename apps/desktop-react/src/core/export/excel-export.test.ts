import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { BookRow } from "../db/repositories/books";
import type { AcademicYearRow } from "../db/repositories/academic-years";
import type { StudentRow } from "../db/repositories/students";
import type { LogEntry } from "../backend/types";
import { getTranslation, type TranslationKey } from "../i18n";
import { buildBooksWorkbook, buildStudentsWorkbook } from "./excel-export";

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

async function expectEmbeddedHeaderLogo(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  startColumn: number,
  endColumn: number,
) {
  const data = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(data);
  const worksheet = restored.getWorksheet(sheetName)!;
  const images = worksheet.getImages();

  expect(restored.model.media).toHaveLength(1);
  expect(restored.model.media[0]).toMatchObject({
    type: "image",
    extension: "jpeg",
  });
  expect(images).toHaveLength(1);
  const range = images[0].range as ExcelJS.ImageRange & {
    ext?: { width: number; height: number };
  };
  expect(range.tl.col).toBeGreaterThanOrEqual(startColumn - 1);
  expect(range.tl.col).toBeLessThan(endColumn);
  expect(range.tl.row).toBeGreaterThanOrEqual(0);
  expect(range.tl.row).toBeLessThan(3);
  expect(range.ext).toBeDefined();
  expect(range.ext!.width / range.ext!.height).toBeCloseTo(1080 / 1063, 2);
}

describe("student Excel export", () => {
  it("embeds a proportional JPEG logo in the reserved header area", async () => {
    const workbook = buildStudentsWorkbook({
      students,
      books,
      gradeLevel: "primary1",
      academicYear: "2025-2026",
      language: "en",
      issuedBookSelectionsByStudentId: {},
      translate: (key) => key,
    });

    await expectEmbeddedHeaderLogo(workbook, "Students", 7, 8);
  });

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

const currentAcademicYear: AcademicYearRow = {
  academicYear: "2026-2027",
  status: "current",
  createdAt: "2026-09-01T22:30:00.000Z",
  archivedAt: null,
};

const englishPrimary1: BookRow = {
  ...books[0], id: "english-primary1", name: "English", gradeLevel: "primary1",
};
const englishPrimary2: BookRow = {
  ...books[0], id: "english-primary2", name: "English", gradeLevel: "primary2",
};
const sciencePrimary1: BookRow = {
  ...books[0], id: "science-primary1", name: "Science", gradeLevel: "primary1",
};
const deletedEnglish: BookRow = {
  ...books[0], id: "deleted-english", name: "English", gradeLevel: "primary3",
  deletedAt: "2026-09-03T10:00:00.000Z",
};

function stockLog({
  id,
  book,
  semester,
  quantity,
  receiptDate,
  receiptNumber,
  reversedByTransactionId = null,
  type = "stock_increase",
}: {
  id: string;
  book: BookRow;
  semester: "first" | "second";
  quantity: number;
  receiptDate: string;
  receiptNumber: string;
  reversedByTransactionId?: string | null;
  type?: string;
}): LogEntry {
  return {
    id: `transaction-${id}`,
    scopeId: "global",
    academicYear: currentAcademicYear.academicYear,
    type,
    studentId: null,
    studentName: null,
    receiptNumber,
    receiptDate,
    reversedTransactionId: null,
    reversedByTransactionId,
    deviceId: "fixture",
    commandId: `command-${id}`,
    occurredAt: `${receiptDate}T10:00:00.000Z`,
    createdAt: `${receiptDate}T10:00:00.000Z`,
    items: [{
      id: `item-${id}`,
      transactionId: `transaction-${id}`,
      bookId: book.id,
      bookName: book.name,
      semester,
      quantityDelta: quantity,
      quantityAfter: quantity,
      createdAt: `${receiptDate}T10:00:00.000Z`,
    }],
  };
}

const bookTranslate = (key: string, values?: Record<string, string | number>) => ({
  "export.alGharbia": "Al-Gharbia",
  "export.eastTantaAdministrativeLearning": "East Tanta",
  "export.alRafiiSchools": "Al-Rafii Schools",
  "export.educationalYear": `for the educational year: ${values?.year}`,
  "export.bookInventoryAudit": "Book Inventory Audit",
  "export.subjectInventoryAudit": `${values?.subject} Inventory Audit`,
  "export.firstTerm": "First Term",
  "export.secondTerm": "Second Term",
  "export.book": "Book",
  "export.grade": "Grade",
  "export.quantity": "Quantity",
  "export.receiptDate": "Receipt date",
  "export.receiptId": "Receipt ID",
  "grades.primary1": "1st Primary",
  "grades.primary2": "2nd Primary",
  "grades.primary3": "3rd Primary",
}[key] ?? key);

describe("book inventory Excel export", () => {
  it("embeds a proportional JPEG logo in the reserved header area", async () => {
    const workbook = buildBooksWorkbook({
      books: [englishPrimary1],
      logs: [],
      academicYear: currentAcademicYear,
      selectedBookIds: [englishPrimary1.id],
      language: "en",
      translate: bookTranslate,
    });

    await expectEmbeddedHeaderLogo(workbook, "Book Inventory", 5, 5);
  });

  it("builds one chronological receipt table with exact grades and term-suffixed books", async () => {
    const workbook = buildBooksWorkbook({
      books: [englishPrimary1, englishPrimary2, sciencePrimary1, deletedEnglish],
      logs: [
        stockLog({ id: "second", book: englishPrimary1, semester: "second", quantity: 4, receiptDate: "2026-09-04", receiptNumber: "R-4" }),
        stockLog({ id: "first-p2", book: englishPrimary2, semester: "first", quantity: 7, receiptDate: "2026-09-03", receiptNumber: "R-3" }),
        stockLog({ id: "first-p1", book: englishPrimary1, semester: "first", quantity: 25, receiptDate: "2026-09-02", receiptNumber: "R-2" }),
        stockLog({ id: "early", book: englishPrimary1, semester: "first", quantity: 9, receiptDate: "2026-09-01", receiptNumber: "R-1" }),
        stockLog({ id: "reversed", book: englishPrimary1, semester: "first", quantity: 11, receiptDate: "2026-09-05", receiptNumber: "R-5", reversedByTransactionId: "reversal-1" }),
        stockLog({ id: "science", book: sciencePrimary1, semester: "first", quantity: 6, receiptDate: "2026-09-02", receiptNumber: "SCI-1" }),
        stockLog({ id: "deleted", book: deletedEnglish, semester: "first", quantity: 8, receiptDate: "2026-09-02", receiptNumber: "DEL-1" }),
        stockLog({ id: "issue", book: englishPrimary1, semester: "first", quantity: -1, receiptDate: "2026-09-06", receiptNumber: "ISSUE", type: "student_issue" }),
      ],
      academicYear: currentAcademicYear,
      selectedBookIds: [englishPrimary1.id, englishPrimary2.id],
      language: "en",
      translate: bookTranslate,
    });
    const data = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(data);
    const worksheet = restored.getWorksheet("Book Inventory")!;

    expect(worksheet.getRow(5).values).toEqual([
      undefined, "Book", "Grade", "Quantity", "Receipt date", "Receipt ID",
    ]);
    expect(worksheet.getRow(6).values).toEqual([
      undefined, "English First Term", "1st Primary", 25, "2026-09-02", "R-2",
    ]);
    expect(worksheet.getRow(7).values).toEqual([
      undefined, "English First Term", "2nd Primary", 7, "2026-09-03", "R-3",
    ]);
    expect(worksheet.getRow(8).values).toEqual([
      undefined, "English Second Term", "1st Primary", 4, "2026-09-04", "R-4",
    ]);
    expect(worksheet.getCell("B1").value).toBe("Book Inventory Audit");
    expect(worksheet.getCell("B2").value).toBe("for the educational year: 2026-2027");
    expect(worksheet.getCell("B6").value).not.toBe("Primary");
    expect(worksheet.getRow(9).values).toEqual([]);
    for (let row = 5; row <= 8; row += 1) {
      for (let column = 1; column <= 5; column += 1) expectThinBorder(worksheet.getCell(row, column));
    }
    expect(worksheet.pageSetup).toMatchObject({
      orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, printArea: "A1:E8",
    });
  });

  it("filters duplicate subject names by exact grade-specific book ID", async () => {
    const workbook = buildBooksWorkbook({
      books: [englishPrimary1, englishPrimary2],
      logs: [
        stockLog({ id: "selected-p1", book: englishPrimary1, semester: "first", quantity: 5, receiptDate: "2026-09-02", receiptNumber: "P1" }),
        stockLog({ id: "excluded-p2", book: englishPrimary2, semester: "first", quantity: 7, receiptDate: "2026-09-03", receiptNumber: "P2" }),
      ],
      academicYear: currentAcademicYear,
      selectedBookIds: [englishPrimary1.id],
      language: "en",
      translate: bookTranslate,
    });
    const data = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(data);
    const worksheet = restored.getWorksheet("Book Inventory")!;

    expect(worksheet.getCell("B1").value).toBe("English — 1st Primary Inventory Audit");
    expect(worksheet.getRow(6).values).toEqual([
      undefined, "English First Term", "1st Primary", 5, "2026-09-02", "P1",
    ]);
    expect(worksheet.getRow(7).values).toEqual([]);
  });

  it("uses the general title for multiple subjects and preserves Arabic RTL suffixes", async () => {
    const workbook = buildBooksWorkbook({
      books: [englishPrimary1, sciencePrimary1],
      logs: [
        stockLog({ id: "arabic-first", book: englishPrimary1, semester: "first", quantity: 2, receiptDate: "2026-09-02", receiptNumber: "A-1" }),
        stockLog({ id: "arabic-second", book: sciencePrimary1, semester: "second", quantity: 3, receiptDate: "2026-09-03", receiptNumber: "A-2" }),
      ],
      academicYear: currentAcademicYear,
      selectedBookIds: [englishPrimary1.id, sciencePrimary1.id],
      language: "ar",
      translate: (key: string, values?: Record<string, string | number>) => ({
        ...Object.fromEntries([
          ["export.alGharbia", "الغربية"],
          ["export.eastTantaAdministrativeLearning", "إدارة شرق طنطا التعليمية"],
          ["export.alRafiiSchools", "مدرسة الرافعي الرسمية للغات"],
          ["export.educationalYear", `للعام الدراسي: ${values?.year}`],
          ["export.bookInventoryAudit", "مراجعة مخزون الكتب"],
          ["export.subjectInventoryAudit", `مراجعة مخزون ${values?.subject}`],
          ["export.firstTerm", "الفصل الدراسي الأول"],
          ["export.secondTerm", "الفصل الدراسي الثاني"],
          ["export.book", "الكتاب"], ["export.grade", "الصف"],
          ["export.quantity", "الكمية"], ["export.receiptDate", "تاريخ إذن الاستلام"],
          ["export.receiptId", "رقم إذن الاستلام"],
          ["grades.primary1", "الأول الابتدائي"],
        ]),
      }[key] ?? key),
    });
    const data = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(data);
    const worksheet = restored.getWorksheet("Book Inventory")!;

    expect(worksheet.views[0]?.rightToLeft).toBe(true);
    expect(worksheet.getCell("B1").value).toBe("مراجعة مخزون الكتب");
    expect(worksheet.getCell("A6").value).toBe("English الفصل الدراسي الأول");
    expect(worksheet.getCell("A7").value).toBe("Science الفصل الدراسي الثاني");
    expect(worksheet.getCell("B6").value).toBe("الأول الابتدائي");
    expect(worksheet.getCell("A6").alignment).toMatchObject({ readingOrder: "rtl" });
  });
});
