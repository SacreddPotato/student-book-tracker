import type { EducationStage } from "@app/shared";

import type { SqlDatabase } from "../local-db";

export type BookRow = {
  id: string;
  scopeId: string;
  name: string;
  educationStage: EducationStage;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export async function upsertBook(database: SqlDatabase, book: BookRow): Promise<void> {
  await database.execute(
    `INSERT INTO books (
      id,
      scope_id,
      name,
      education_stage,
      quantity,
      created_at,
      updated_at,
      deleted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT(id) DO UPDATE SET
      scope_id = excluded.scope_id,
      name = excluded.name,
      education_stage = excluded.education_stage,
      quantity = excluded.quantity,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at`,
    [
      book.id,
      book.scopeId,
      book.name,
      book.educationStage,
      book.quantity,
      book.createdAt,
      book.updatedAt,
      book.deletedAt,
    ],
  );
}

export async function listBooks(database: SqlDatabase): Promise<BookRow[]> {
  return database.select<BookRow>(
    `SELECT
      id,
      scope_id AS scopeId,
      name,
      education_stage AS educationStage,
      quantity,
      created_at AS createdAt,
      updated_at AS updatedAt,
      deleted_at AS deletedAt
    FROM books
    WHERE deleted_at IS NULL
    ORDER BY education_stage, name`,
  );
}

export async function getBookById(database: SqlDatabase, bookId: string): Promise<BookRow | null> {
  const rows = await database.select<BookRow>(
    `SELECT
      id,
      scope_id AS scopeId,
      name,
      education_stage AS educationStage,
      quantity,
      created_at AS createdAt,
      updated_at AS updatedAt,
      deleted_at AS deletedAt
    FROM books
    WHERE id = $1
      AND deleted_at IS NULL`,
    [bookId],
  );

  return rows[0] ?? null;
}

export async function getBooksByIds(
  database: SqlDatabase,
  bookIds: readonly string[],
): Promise<BookRow[]> {
  const books: BookRow[] = [];

  for (const bookId of bookIds) {
    const book = await getBookById(database, bookId);
    if (book) {
      books.push(book);
    }
  }

  return books;
}

export async function updateBookQuantity(
  database: SqlDatabase,
  bookId: string,
  quantity: number,
  updatedAt: string,
): Promise<void> {
  await database.execute("UPDATE books SET quantity = $1, updated_at = $2 WHERE id = $3", [
    quantity,
    updatedAt,
    bookId,
  ]);
}
