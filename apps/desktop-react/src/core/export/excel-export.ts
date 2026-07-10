import ExcelJS from "exceljs";
import {
  gradeLevelsByStage,
  type EducationStage,
  type GradeLevel,
} from "@app/shared";

import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";

export type ExportLanguage = "en" | "ar";
export type ExportGrade = GradeLevel | "all";
export type TranslateExport = (key: string) => string;

export type StudentsWorkbookInput = {
  students: StudentRow[];
  books: BookRow[];
  gradeLevel: ExportGrade;
  language: ExportLanguage;
  issuedBookIdsByStudentId: Record<string, string[]>;
  translate: TranslateExport;
};

export function buildStudentsWorkbook(input: StudentsWorkbookInput): ExcelJS.Workbook {
  if (input.gradeLevel === "all") {
    throw new Error("Choose a grade group before exporting.");
  }
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students");
  const stage = stageForGrade(input.gradeLevel);
  const stageBooks = input.books
    .filter((book) => !book.deletedAt && book.educationStage === stage)
    .sort((left, right) => left.name.localeCompare(right.name));
  const gradeStudents = input.students
    .filter((student) => !student.deletedAt && student.gradeLevel === input.gradeLevel)
    .sort((left, right) => left.name.localeCompare(right.name));
  const t = input.translate;

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
  worksheet.getCell("D2").value = t(`grades.${input.gradeLevel}`);
  worksheet.getCell("D3").value = t("export.educationalYear");
  worksheet.mergeCells("G1:H3");
  worksheet.getCell("G1").border = {
    top: { style: "thin" }, left: { style: "thin" },
    bottom: { style: "thin" }, right: { style: "thin" },
  };

  const headerRow = 5;
  worksheet.getCell(headerRow, 1).value = t("export.name");
  stageBooks.forEach((book, index) => {
    worksheet.getCell(headerRow, index + 2).value = book.name;
  });
  worksheet.getCell(headerRow, stageBooks.length + 2).value = t("export.studentSignature");
  worksheet.getRow(headerRow).font = { bold: true };

  gradeStudents.forEach((student, studentIndex) => {
    const row = headerRow + studentIndex + 1;
    const issued = new Set(input.issuedBookIdsByStudentId[student.id] ?? []);
    worksheet.getCell(row, 1).value = student.name;
    stageBooks.forEach((book, bookIndex) => {
      worksheet.getCell(row, bookIndex + 2).value = issued.has(book.id)
        ? t("students.issued")
        : "";
    });
    worksheet.getCell(row, stageBooks.length + 2).value = "";
  });

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

function stageForGrade(grade: GradeLevel): EducationStage {
  for (const [stage, grades] of Object.entries(gradeLevelsByStage) as Array<
    [EducationStage, readonly GradeLevel[]]
  >) {
    if (grades.includes(grade)) return stage;
  }
  throw new Error(`Unknown grade level: ${grade}`);
}
