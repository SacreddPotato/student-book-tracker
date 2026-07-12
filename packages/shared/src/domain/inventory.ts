import type { EducationStage, GradeLevel } from "./education";

export const bookSemesters = ["first", "second"] as const;
export type BookSemester = (typeof bookSemesters)[number];

export type BookSelection = {
  bookId: string;
  semester: BookSemester;
};

export type GradeScopedBook = {
  id?: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
};

export type GradeScopedStudent = {
  id?: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
};

export function bookCanBeIssuedToStudent(
  book: GradeScopedBook,
  student: GradeScopedStudent,
): boolean {
  return book.educationStage === student.educationStage
    && book.gradeLevel === student.gradeLevel;
}
