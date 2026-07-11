import ExcelJS from "exceljs";
import {
  gradeLevelsByStage,
  type EducationStage,
  type GradeLevel,
} from "@app/shared";

import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";
import { getTranslation, type Language } from "../i18n";

export type StudentExportGrade = GradeLevel | "all";

export type ExportStudentsWorkbookInput = {
  students: StudentRow[];
  books: BookRow[];
  selectedStage: EducationStage | "all";
  selectedGradeLevel: StudentExportGrade;
  language: Language;
  issuedBookIdsByStudentId: Record<string, string[]>;
};

export type StudentsWorkbook = ExcelJS.Workbook;

const worksheetName = "Students";
const defaultExportFileName = "student-book-export.xlsx";
const spreadsheetMimeType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function exportStudentsWorkbook(input: ExportStudentsWorkbookInput): StudentsWorkbook {
  if (input.selectedGradeLevel === "all") {
    throw new Error("Choose a grade group before exporting.");
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(worksheetName);
  const stage = getStageForGrade(input.selectedGradeLevel);
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(input.language, key);
  const stageBooks = input.books
    .filter((book) => book.deletedAt === null && book.educationStage === stage)
    .sort((left, right) => left.name.localeCompare(right.name));
  const gradeStudents = input.students
    .filter((student) => student.deletedAt === null && student.gradeLevel === input.selectedGradeLevel)
    .sort((left, right) => left.name.localeCompare(right.name));

  worksheet.views = [{ rightToLeft: input.language === "ar" }];
  worksheet.columns = [
    { width: 28 },
    ...stageBooks.map(() => ({ width: 18 })),
    { width: 22 },
  ];

  worksheet.getCell("A1").value = t("export.alGharbia");
  worksheet.getCell("A2").value = t("export.eastTantaAdministrativeLearning");
  worksheet.getCell("A3").value = t("export.alRafiiSchools");
  worksheet.getCell("D1").value = t(`stages.${stage}`);
  worksheet.getCell("D2").value = t(`grades.${input.selectedGradeLevel}`);
  worksheet.getCell("D3").value = t("export.educationalYear");
  worksheet.mergeCells("G1:H3");
  worksheet.getCell("G1").border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  const headerRowNumber = 5;
  worksheet.getCell(headerRowNumber, 1).value = t("export.name");
  for (const [index, book] of stageBooks.entries()) {
    worksheet.getCell(headerRowNumber, index + 2).value = book.name;
  }
  worksheet.getCell(headerRowNumber, stageBooks.length + 2).value = t("export.studentSignature");
  worksheet.getRow(headerRowNumber).font = { bold: true };

  for (const [studentIndex, student] of gradeStudents.entries()) {
    const rowNumber = headerRowNumber + studentIndex + 1;
    const issuedBookIds = new Set(input.issuedBookIdsByStudentId[student.id] ?? []);

    worksheet.getCell(rowNumber, 1).value = student.name;
    for (const [bookIndex, book] of stageBooks.entries()) {
      worksheet.getCell(rowNumber, bookIndex + 2).value = issuedBookIds.has(book.id)
        ? t("students.issued")
        : "";
    }
    worksheet.getCell(rowNumber, stageBooks.length + 2).value = "";
  }

  return workbook;
}

export async function downloadStudentsWorkbook(
  workbook: StudentsWorkbook,
  fileName = defaultExportFileName,
): Promise<void> {
  const data = await workbook.xlsx.writeBuffer();
  const blob = new Blob([data as BlobPart], { type: spreadsheetMimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getStageForGrade(gradeLevel: GradeLevel): EducationStage {
  for (const [stage, grades] of Object.entries(gradeLevelsByStage) as Array<
    [EducationStage, readonly GradeLevel[]]
  >) {
    if (grades.includes(gradeLevel)) {
      return stage;
    }
  }

  throw new Error(`Unknown grade level: ${gradeLevel}`);
}
