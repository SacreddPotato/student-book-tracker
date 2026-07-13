import type { BookSemester, EducationStage, GradeLevel } from "@app/shared";

import type { SqlDatabase } from "../types";

export type BookRow = {
  id: string;
  scopeId: string;
  name: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
  firstSemesterQuantity: number;
  secondSemesterQuantity: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export function getBookSemesterQuantity(book: BookRow, semester: BookSemester) {
  return semester === "first" ? book.firstSemesterQuantity : book.secondSemesterQuantity;
}

export async function upsertBook(database: SqlDatabase, row: BookRow) {
  await database.execute(
    `INSERT INTO books (id, scope_id, name, education_stage, grade_level,
      first_semester_quantity, second_semester_quantity, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT(id) DO UPDATE SET scope_id = excluded.scope_id,
      name = excluded.name, education_stage = excluded.education_stage,
      grade_level = excluded.grade_level,
      first_semester_quantity = excluded.first_semester_quantity,
      second_semester_quantity = excluded.second_semester_quantity,
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [row.id, row.scopeId, row.name, row.educationStage, row.gradeLevel,
      row.firstSemesterQuantity, row.secondSemesterQuantity, row.createdAt,
      row.updatedAt, row.deletedAt],
  );
}

const bookSelect = `SELECT id, scope_id AS scopeId, name,
  education_stage AS educationStage,
  grade_level AS gradeLevel,
  first_semester_quantity AS firstSemesterQuantity,
  second_semester_quantity AS secondSemesterQuantity,
  created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt FROM books`;

export function listBooks(database: SqlDatabase): Promise<BookRow[]> {
  return database.select(
    `${bookSelect} WHERE deleted_at IS NULL ORDER BY education_stage, grade_level, name`,
  );
}

export function listBookRecords(database: SqlDatabase): Promise<BookRow[]> {
  return database.select(
    `${bookSelect} ORDER BY education_stage, grade_level, name`,
  );
}

export async function getBookById(database: SqlDatabase, id: string) {
  const rows = await database.select<BookRow>(
    `${bookSelect} WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getBooksByIds(database: SqlDatabase, ids: readonly string[]) {
  const rows: BookRow[] = [];
  for (const id of ids) {
    const row = await getBookById(database, id);
    if (row) rows.push(row);
  }
  return rows;
}

export async function markBookDeleted(
  database: SqlDatabase,
  id: string,
  deletedAt: string,
) {
  await database.execute(
    `UPDATE books SET deleted_at = $1, updated_at = $1
      WHERE id = $2 AND deleted_at IS NULL`,
    [deletedAt, id],
  );
}

export async function updateBookSemesterQuantity(
  database: SqlDatabase,
  id: string,
  semester: BookSemester,
  quantity: number,
  updatedAt: string,
) {
  const column = semester === "first"
    ? "first_semester_quantity"
    : "second_semester_quantity";
  await database.execute(
    `UPDATE books SET ${column} = $1, updated_at = $2 WHERE id = $3`,
    [quantity, updatedAt, id],
  );
}
