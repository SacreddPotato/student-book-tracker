import ExcelJS from "exceljs";
import type { BookSemester, GradeLevel } from "@app/shared";

import logoDataUrl from "../../../assets/logo.jpeg?inline";
import type { AcademicYearRow } from "../db/repositories/academic-years";
import type { LogEntry } from "../backend/types";
import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";

export type ExportLanguage = "en" | "ar";
export type ExportGrade = GradeLevel | "all";
export type TranslateExport = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type StudentsWorkbookInput = {
  students: StudentRow[];
  books: BookRow[];
  gradeLevel: ExportGrade;
  academicYear: string;
  language: ExportLanguage;
  issuedBookSelectionsByStudentId: Record<
    string,
    Array<{ bookId: string; semester: "first" | "second" }>
  >;
  translate: TranslateExport;
};

export type BooksWorkbookInput = {
  books: BookRow[];
  logs: LogEntry[];
  academicYear: AcademicYearRow;
  selectedBookIds: string[];
  language: ExportLanguage;
  translate: TranslateExport;
};

export type BookReceiptExportRow = {
  itemId: string;
  bookId: string;
  bookName: string;
  gradeLevel: GradeLevel;
  semester: BookSemester;
  quantity: number;
  receiptDate: string;
  receiptNumber: string;
};

const LOGO_SOURCE_WIDTH = 1080;
const LOGO_SOURCE_HEIGHT = 1063;
const HEADER_ROW_HEIGHT_POINTS = 24;
const POINTS_TO_PIXELS = 4 / 3;
const DEFAULT_COLUMN_WIDTH = 8.43;

function formatAcademicYear(academicYear: string, language: ExportLanguage): string {
  return language === "ar" ? `\u200E${academicYear}\u200E` : academicYear;
}

function columnWidthPixels(worksheet: ExcelJS.Worksheet, column: number): number {
  return Math.floor((worksheet.getColumn(column).width ?? DEFAULT_COLUMN_WIDTH) * 7 + 5);
}

function columnAnchorForOffset(
  worksheet: ExcelJS.Worksheet,
  startColumn: number,
  endColumn: number,
  offsetPixels: number,
): number {
  let remainingPixels = offsetPixels;
  for (let column = startColumn; column <= endColumn; column += 1) {
    const widthPixels = columnWidthPixels(worksheet, column);
    if (remainingPixels <= widthPixels) {
      return column - 1 + remainingPixels / widthPixels;
    }
    remainingPixels -= widthPixels;
  }
  return endColumn - 0.01;
}

function addHeaderLogo(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  startColumn: number,
  endColumn: number,
): void {
  for (let row = 1; row <= 3; row += 1) {
    worksheet.getRow(row).height = HEADER_ROW_HEIGHT_POINTS;
  }
  const availableWidth = Array.from(
    { length: endColumn - startColumn + 1 },
    (_, index) => columnWidthPixels(worksheet, startColumn + index),
  ).reduce((total, width) => total + width, 0);
  const availableHeight = HEADER_ROW_HEIGHT_POINTS * POINTS_TO_PIXELS * 3;
  const logoRatio = LOGO_SOURCE_WIDTH / LOGO_SOURCE_HEIGHT;
  const maxWidth = availableWidth - 24;
  const maxHeight = availableHeight - 12;
  const width = Math.min(maxWidth, maxHeight * logoRatio);
  const height = width / logoRatio;
  const leftOffset = (availableWidth - width) / 2;
  const topOffset = (availableHeight - height) / 2;
  const imageId = workbook.addImage({
    base64: logoDataUrl,
    extension: "jpeg",
  });

  worksheet.addImage(imageId, {
    tl: {
      col: columnAnchorForOffset(worksheet, startColumn, endColumn, leftOffset),
      row: topOffset / (HEADER_ROW_HEIGHT_POINTS * POINTS_TO_PIXELS),
    },
    ext: { width, height },
    editAs: "oneCell",
  });
}

export function buildStudentsWorkbook(input: StudentsWorkbookInput): ExcelJS.Workbook {
  if (input.gradeLevel === "all") {
    throw new Error("Choose a grade group before exporting.");
  }
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students");
  const stageBooks = input.books
    .filter((book) => !book.deletedAt && book.gradeLevel === input.gradeLevel)
    .sort((left, right) => left.name.localeCompare(right.name));
  const gradeStudents = input.students
    .filter((student) => !student.deletedAt && student.gradeLevel === input.gradeLevel)
    .sort((left, right) => left.name.localeCompare(right.name));
  const t = input.translate;
  const dataColumnCount = stageBooks.length + 2;
  const headerColumnCount = Math.max(dataColumnCount, 8);
  const sideColumnCount = Math.min(3, Math.floor(headerColumnCount / 3));
  const centerStartColumn = sideColumnCount + 1;
  const centerEndColumn = headerColumnCount - sideColumnCount;
  const logoStartColumn = centerEndColumn + 1;
  const readingOrder = input.language === "ar" ? "rtl" : "ltr";
  const textAlignment: Partial<ExcelJS.Alignment> = {
    horizontal: input.language === "ar" ? "right" : "left",
    vertical: "middle",
    readingOrder,
    wrapText: true,
  };
  const centeredAlignment: Partial<ExcelJS.Alignment> = {
    horizontal: "center",
    vertical: "middle",
    readingOrder,
    wrapText: true,
  };
  const tableBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };
  const signatureColumn = stageBooks.length + 2;
  const tableCell = (row: number, column: number) => {
    const cell = worksheet.getCell(row, column);
    cell.border = tableBorder;
    return cell;
  };
  const signatureCell = (row: number) => {
    if (signatureColumn < headerColumnCount) {
      worksheet.mergeCells(row, signatureColumn, row, headerColumnCount);
    }
    return tableCell(row, signatureColumn);
  };

  worksheet.views = [{ rightToLeft: input.language === "ar" }];
  worksheet.columns = [
    { width: 28 },
    ...stageBooks.map(() => ({ width: 18 })),
    { width: 22 },
    ...Array.from({ length: headerColumnCount - dataColumnCount }, () => ({ width: 14 })),
  ];
  for (let row = 1; row <= 3; row += 1) {
    worksheet.mergeCells(row, 1, row, sideColumnCount);
  }
  worksheet.mergeCells(1, centerStartColumn, 1, centerEndColumn);
  worksheet.mergeCells(2, centerStartColumn, 2, centerEndColumn);
  worksheet.mergeCells(1, logoStartColumn, 3, headerColumnCount);

  worksheet.getCell(1, 1).value = t("export.alGharbia");
  worksheet.getCell(2, 1).value = t("export.eastTantaAdministrativeLearning");
  worksheet.getCell(3, 1).value = t("export.alRafiiSchools");
  for (let row = 1; row <= 3; row += 1) {
    worksheet.getCell(row, 1).alignment = textAlignment;
  }
  const gradeHeader = worksheet.getCell(1, centerStartColumn);
  gradeHeader.value = t("export.gradeHeading", {
    grade: t(`grades.${input.gradeLevel}`),
  });
  gradeHeader.font = { bold: true, size: 14 };
  gradeHeader.alignment = centeredAlignment;
  const yearHeader = worksheet.getCell(2, centerStartColumn);
  yearHeader.value = t("export.educationalYear", {
    year: formatAcademicYear(input.academicYear, input.language),
  });
  yearHeader.font = { bold: true, size: 12 };
  yearHeader.alignment = centeredAlignment;
  worksheet.getCell(1, logoStartColumn).border = {
    top: { style: "thin" }, left: { style: "thin" },
    bottom: { style: "thin" }, right: { style: "thin" },
  };
  addHeaderLogo(workbook, worksheet, logoStartColumn, headerColumnCount);

  const headerRow = 5;
  const nameHeader = tableCell(headerRow, 1);
  nameHeader.value = t("export.name");
  nameHeader.alignment = centeredAlignment;
  stageBooks.forEach((book, index) => {
    const subjectHeader = tableCell(headerRow, index + 2);
    subjectHeader.value = book.name;
    subjectHeader.alignment = centeredAlignment;
  });
  const signatureHeader = signatureCell(headerRow);
  signatureHeader.value = t("export.studentSignature");
  signatureHeader.alignment = centeredAlignment;
  worksheet.getRow(headerRow).font = { bold: true };

  gradeStudents.forEach((student, studentIndex) => {
    const row = headerRow + studentIndex + 1;
    const issued = new Set((input.issuedBookSelectionsByStudentId[student.id] ?? [])
      .map(({ bookId, semester }) => `${bookId}:${semester}`));
    const studentName = tableCell(row, 1);
    studentName.value = student.name;
    studentName.alignment = textAlignment;
    stageBooks.forEach((book, bookIndex) => {
      const first = issued.has(`${book.id}:first`);
      const second = issued.has(`${book.id}:second`);
      const stateCell = tableCell(row, bookIndex + 2);
      stateCell.value = first && second
        ? "2"
        : first || second
          ? "1"
            : "0";
      stateCell.alignment = centeredAlignment;
    });
    const studentSignature = signatureCell(row);
    studentSignature.value = "";
    studentSignature.alignment = centeredAlignment;
  });

  worksheet.pageSetup.orientation = "landscape";
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.horizontalCentered = true;
  const lastRow = headerRow + gradeStudents.length;
  worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(headerColumnCount).letter}${lastRow}`;

  return workbook;
}

function cairoDateKey(utcIso: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(utcIso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function bookReceiptRows(input: BooksWorkbookInput): BookReceiptExportRow[] {
  const selectedBookIds = new Set(input.selectedBookIds);
  const activeBooks = new Map(input.books
    .filter((book) => !book.deletedAt && selectedBookIds.has(book.id))
    .map((book) => [book.id, book]));
  const cutoff = cairoDateKey(input.academicYear.createdAt);
  const rows = input.logs.flatMap((log): BookReceiptExportRow[] => {
    if (log.type !== "stock_increase"
      || log.reversedByTransactionId
      || !log.receiptNumber
      || !log.receiptDate
      || log.receiptDate < cutoff) return [];
    return log.items.flatMap((item): BookReceiptExportRow[] => {
      const book = activeBooks.get(item.bookId);
      if (!book || item.quantityDelta <= 0) return [];
      return [{
        itemId: item.id,
        bookId: book.id,
        bookName: book.name,
        gradeLevel: book.gradeLevel,
        semester: item.semester,
        quantity: item.quantityDelta,
        receiptDate: log.receiptDate!,
        receiptNumber: log.receiptNumber!,
      }];
    });
  });
  const semesterOrder: Record<BookSemester, number> = { first: 0, second: 1 };
  return rows.sort((left, right) => left.receiptDate.localeCompare(right.receiptDate)
    || left.receiptNumber.localeCompare(right.receiptNumber)
    || left.bookName.localeCompare(right.bookName)
    || semesterOrder[left.semester] - semesterOrder[right.semester]
    || left.gradeLevel.localeCompare(right.gradeLevel)
    || left.itemId.localeCompare(right.itemId));
}

export function buildBooksWorkbook(input: BooksWorkbookInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Book Inventory");
  const t = input.translate;
  const readingOrder = input.language === "ar" ? "rtl" : "ltr";
  const textAlignment: Partial<ExcelJS.Alignment> = {
    horizontal: input.language === "ar" ? "right" : "left",
    vertical: "middle",
    readingOrder,
    wrapText: true,
  };
  const centeredAlignment: Partial<ExcelJS.Alignment> = {
    horizontal: "center",
    vertical: "middle",
    readingOrder,
    wrapText: true,
  };
  const tableBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };
  const selectedBookIds = new Set(input.selectedBookIds);
  const selectedBooks = input.books.filter((book) =>
    !book.deletedAt && selectedBookIds.has(book.id));
  const title = selectedBooks.length === 1
    ? t("export.subjectInventoryAudit", {
        subject: `${selectedBooks[0].name} — ${t(`grades.${selectedBooks[0].gradeLevel}`)}`,
      })
    : t("export.bookInventoryAudit");

  worksheet.views = [{ rightToLeft: input.language === "ar" }];
  worksheet.columns = [
    { width: 32 }, { width: 22 }, { width: 14 }, { width: 20 }, { width: 20 },
  ];
  worksheet.mergeCells("B1:D1");
  worksheet.mergeCells("B2:D2");
  worksheet.mergeCells("E1:E3");
  worksheet.getCell("A1").value = t("export.alGharbia");
  worksheet.getCell("A2").value = t("export.eastTantaAdministrativeLearning");
  worksheet.getCell("A3").value = t("export.alRafiiSchools");
  for (let row = 1; row <= 3; row += 1) worksheet.getCell(row, 1).alignment = textAlignment;
  worksheet.getCell("B1").value = title;
  worksheet.getCell("B1").font = { bold: true, size: 14 };
  worksheet.getCell("B1").alignment = centeredAlignment;
  worksheet.getCell("B2").value = t("export.educationalYear", {
    year: formatAcademicYear(input.academicYear.academicYear, input.language),
  });
  worksheet.getCell("B2").font = { bold: true, size: 12 };
  worksheet.getCell("B2").alignment = centeredAlignment;
  worksheet.getCell("E1").border = tableBorder;
  addHeaderLogo(workbook, worksheet, 5, 5);

  const headerRow = 5;
  const headings = ["book", "grade", "quantity", "receiptDate", "receiptId"];
  headings.forEach((key, index) => {
    const cell = worksheet.getCell(headerRow, index + 1);
    cell.value = t(`export.${key}`);
    cell.alignment = centeredAlignment;
    cell.border = tableBorder;
  });
  worksheet.getRow(headerRow).font = { bold: true };

  const rows = bookReceiptRows(input);
  rows.forEach((row, index) => {
    const excelRow = headerRow + index + 1;
    const term = t(row.semester === "first" ? "export.firstTerm" : "export.secondTerm");
    const values: Array<string | number> = [
      `${row.bookName} ${term}`,
      t(`grades.${row.gradeLevel}`),
      row.quantity,
      row.receiptDate,
      row.receiptNumber,
    ];
    values.forEach((value, columnIndex) => {
      const cell = worksheet.getCell(excelRow, columnIndex + 1);
      cell.value = value;
      cell.alignment = columnIndex === 0 ? textAlignment : centeredAlignment;
      cell.border = tableBorder;
    });
  });

  worksheet.pageSetup.orientation = "landscape";
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.horizontalCentered = true;
  const lastRow = headerRow + rows.length;
  worksheet.pageSetup.printArea = `A1:E${lastRow}`;
  return workbook;
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string) {
  const data = await workbook.xlsx.writeBuffer();
  const blob = new Blob([data as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadStudentsWorkbook(
  workbook: ExcelJS.Workbook,
  fileName = "student-book-export.xlsx",
) {
  await downloadWorkbook(workbook, fileName);
}

export async function downloadBooksWorkbook(
  workbook: ExcelJS.Workbook,
  fileName = "book-inventory-audit.xlsx",
) {
  await downloadWorkbook(workbook, fileName);
}
