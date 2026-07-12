import type { EducationStage, GradeLevel } from "@app/shared";

import type { SqlDatabase } from "../types";

export type StudentRow = {
  id: string;
  scopeId: string;
  name: string;
  governmentId: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
  academicYear: string;
  previousStudentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export async function upsertStudent(database: SqlDatabase, row: StudentRow) {
  await database.execute(
    `INSERT INTO students (id, scope_id, name, government_id, education_stage,
      grade_level, academic_year, previous_student_id, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(id) DO UPDATE SET scope_id = excluded.scope_id,
      name = excluded.name, government_id = excluded.government_id,
      education_stage = excluded.education_stage, grade_level = excluded.grade_level,
      academic_year = excluded.academic_year,
      previous_student_id = excluded.previous_student_id,
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [row.id, row.scopeId, row.name, row.governmentId, row.educationStage,
      row.gradeLevel, row.academicYear, row.previousStudentId, row.createdAt,
      row.updatedAt, row.deletedAt],
  );
}

const studentSelect = `SELECT id, scope_id AS scopeId, name,
  government_id AS governmentId, education_stage AS educationStage,
  grade_level AS gradeLevel, academic_year AS academicYear,
  previous_student_id AS previousStudentId, created_at AS createdAt,
  updated_at AS updatedAt, deleted_at AS deletedAt FROM students`;

export function listStudents(database: SqlDatabase, academicYear: string): Promise<StudentRow[]> {
  return database.select(
    `${studentSelect} WHERE academic_year = $1 AND deleted_at IS NULL ORDER BY name`,
    [academicYear],
  );
}

export function listStudentRecords(
  database: SqlDatabase,
  academicYear: string,
): Promise<StudentRow[]> {
  return database.select(
    `${studentSelect} WHERE academic_year = $1 ORDER BY name`,
    [academicYear],
  );
}

export async function getStudentById(database: SqlDatabase, id: string) {
  const rows = await database.select<StudentRow>(
    `${studentSelect} WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function markStudentDeleted(
  database: SqlDatabase,
  id: string,
  deletedAt: string,
) {
  await database.execute(
    `UPDATE students SET deleted_at = $1, updated_at = $1
      WHERE id = $2 AND deleted_at IS NULL`,
    [deletedAt, id],
  );
}
