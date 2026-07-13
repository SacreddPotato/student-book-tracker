import ExcelJS from "exceljs";
import type { GradeLevel } from "@app/shared";

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

function formatAcademicYear(academicYear: string, language: ExportLanguage): string {
  return language === "ar" ? `\u200E${academicYear}\u200E` : academicYear;
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

export async function downloadStudentsWorkbook(
  workbook: ExcelJS.Workbook,
  fileName = "student-book-export.xlsx",
) {
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
