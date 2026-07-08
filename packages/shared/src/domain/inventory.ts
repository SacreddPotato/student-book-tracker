import type { EducationStage } from "./education";

export type StageScopedBook = {
  id?: string;
  educationStage: EducationStage;
};

export type StageScopedStudent = {
  id?: string;
  educationStage: EducationStage;
};

export function bookCanBeIssuedToStudent(
  book: StageScopedBook,
  student: StageScopedStudent,
): boolean {
  return book.educationStage === student.educationStage;
}
