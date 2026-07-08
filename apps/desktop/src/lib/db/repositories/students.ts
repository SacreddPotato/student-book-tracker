import type { EducationStage, GradeLevel } from "@app/shared";

import type { SqlDatabase } from "../local-db";

export type StudentRow = {
  id: string;
  scopeId: string;
  name: string;
  governmentId: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export async function upsertStudent(database: SqlDatabase, student: StudentRow): Promise<void> {
  await database.execute(
    `INSERT INTO students (
      id,
      scope_id,
      name,
      government_id,
      education_stage,
      grade_level,
      created_at,
      updated_at,
      deleted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT(id) DO UPDATE SET
      scope_id = excluded.scope_id,
      name = excluded.name,
      government_id = excluded.government_id,
      education_stage = excluded.education_stage,
      grade_level = excluded.grade_level,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at`,
    [
      student.id,
      student.scopeId,
      student.name,
      student.governmentId,
      student.educationStage,
      student.gradeLevel,
      student.createdAt,
      student.updatedAt,
      student.deletedAt,
    ],
  );
}

export async function listStudents(database: SqlDatabase): Promise<StudentRow[]> {
  return database.select<StudentRow>(
    `SELECT
      id,
      scope_id AS scopeId,
      name,
      government_id AS governmentId,
      education_stage AS educationStage,
      grade_level AS gradeLevel,
      created_at AS createdAt,
      updated_at AS updatedAt,
      deleted_at AS deletedAt
    FROM students
    WHERE deleted_at IS NULL
    ORDER BY name`,
  );
}
