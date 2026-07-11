import type { EducationStage } from "./education";

export const bookSemesters = ["first", "second"] as const;
export type BookSemester = (typeof bookSemesters)[number];

export type BookSelection = {
  bookId: string;
  semester: BookSemester;
};

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
