import type { BookSemester } from "@app/shared";

import type { SqlDatabase } from "../types";

export type InventoryTransactionRow = {
  id: string;
  scopeId: string;
  academicYear: string;
  type: string;
  studentId: string | null;
  receiptNumber: string | null;
  receiptDate: string | null;
  reversedTransactionId: string | null;
  reversedByTransactionId: string | null;
  deviceId: string | null;
  commandId: string;
  occurredAt: string;
  createdAt: string;
};

export type InventoryTransactionItemRow = {
  id: string;
  transactionId: string;
  bookId: string;
  semester: BookSemester;
  quantityDelta: number;
  quantityAfter: number;
  createdAt: string;
};

export type StudentBookRow = {
  id: string;
  scopeId: string;
  academicYear: string;
  studentId: string;
  bookId: string;
  semester: BookSemester;
  issuedTransactionId: string;
  createdAt: string;
  reversedAt: string | null;
};

export async function createInventoryTransaction(
  database: SqlDatabase,
  row: InventoryTransactionRow,
  items: InventoryTransactionItemRow[],
) {
  await database.execute(
    `INSERT INTO inventory_transactions (id, scope_id, academic_year, type,
      student_id, receipt_number, receipt_date, reversed_transaction_id,
      reversed_by_transaction_id, device_id, command_id, occurred_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [row.id, row.scopeId, row.academicYear, row.type, row.studentId,
      row.receiptNumber, row.receiptDate, row.reversedTransactionId,
      row.reversedByTransactionId, row.deviceId, row.commandId, row.occurredAt,
      row.createdAt],
  );
  for (const item of items) {
    await database.execute(
      `INSERT INTO inventory_transaction_items (id, transaction_id, book_id,
        semester, quantity_delta, quantity_after, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [item.id, item.transactionId, item.bookId, item.semester,
        item.quantityDelta, item.quantityAfter, item.createdAt],
    );
  }
}

const transactionSelect = `SELECT id, scope_id AS scopeId,
  academic_year AS academicYear, type, student_id AS studentId,
  receipt_number AS receiptNumber, receipt_date AS receiptDate,
  reversed_transaction_id AS reversedTransactionId,
  reversed_by_transaction_id AS reversedByTransactionId, device_id AS deviceId,
  command_id AS commandId, occurred_at AS occurredAt, created_at AS createdAt
  FROM inventory_transactions`;

export function listInventoryTransactions(database: SqlDatabase, academicYear: string) {
  return database.select<InventoryTransactionRow>(
    `${transactionSelect} WHERE academic_year = $1
      ORDER BY occurred_at DESC, created_at DESC, id DESC`,
    [academicYear],
  );
}

export async function getInventoryTransactionById(database: SqlDatabase, id: string) {
  const rows = await database.select<InventoryTransactionRow>(
    `${transactionSelect} WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getInventoryTransactionByCommandId(
  database: SqlDatabase,
  commandId: string,
) {
  const rows = await database.select<InventoryTransactionRow>(
    `${transactionSelect} WHERE command_id = $1`,
    [commandId],
  );
  return rows[0] ?? null;
}

export async function upsertSyncedInventoryTransaction(
  database: SqlDatabase,
  row: InventoryTransactionRow,
): Promise<{ transactionId: string; alreadyPresent: boolean }> {
  const rows = await database.select<InventoryTransactionRow>(
    `${transactionSelect} WHERE id = $1 OR command_id = $2 OR command_id = $3`,
    [row.id, row.commandId, row.id],
  );
  const existing = rows[0];
  if (!existing) {
    await createInventoryTransaction(database, row, []);
    return { transactionId: row.id, alreadyPresent: false };
  }
  await database.execute(
    `UPDATE inventory_transactions SET scope_id = $1, academic_year = $2,
      type = $3, student_id = $4, receipt_number = $5, receipt_date = $6,
      reversed_transaction_id = $7, reversed_by_transaction_id = $8,
      device_id = $9, command_id = $10, occurred_at = $11, created_at = $12
      WHERE id = $13`,
    [row.scopeId, row.academicYear, row.type, row.studentId, row.receiptNumber,
      row.receiptDate, row.reversedTransactionId, row.reversedByTransactionId,
      row.deviceId, existing.commandId === row.commandId ? row.commandId : existing.commandId,
      row.occurredAt, row.createdAt, existing.id],
  );
  return { transactionId: existing.id, alreadyPresent: true };
}

export async function upsertSyncedInventoryTransactionItem(
  database: SqlDatabase,
  item: InventoryTransactionItemRow,
) {
  await database.execute(
    `INSERT INTO inventory_transaction_items (id, transaction_id, book_id,
      semester, quantity_delta, quantity_after, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(id) DO UPDATE SET transaction_id = excluded.transaction_id,
      book_id = excluded.book_id, semester = excluded.semester,
      quantity_delta = excluded.quantity_delta,
      quantity_after = excluded.quantity_after, created_at = excluded.created_at`,
    [item.id, item.transactionId, item.bookId, item.semester,
      item.quantityDelta, item.quantityAfter, item.createdAt],
  );
}

export async function upsertSyncedStudentBook(database: SqlDatabase, row: StudentBookRow) {
  await database.execute(
    `INSERT INTO student_books (id, scope_id, academic_year, student_id, book_id,
      semester, issued_transaction_id, created_at, reversed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT(id) DO UPDATE SET scope_id = excluded.scope_id,
      academic_year = excluded.academic_year, student_id = excluded.student_id,
      book_id = excluded.book_id, semester = excluded.semester,
      issued_transaction_id = excluded.issued_transaction_id,
      created_at = excluded.created_at, reversed_at = excluded.reversed_at`,
    [row.id, row.scopeId, row.academicYear, row.studentId, row.bookId,
      row.semester, row.issuedTransactionId, row.createdAt, row.reversedAt],
  );
}

export function listInventoryTransactionItems(database: SqlDatabase, transactionId: string) {
  return database.select<InventoryTransactionItemRow>(
    `SELECT id, transaction_id AS transactionId, book_id AS bookId, semester,
      quantity_delta AS quantityDelta, quantity_after AS quantityAfter,
      created_at AS createdAt FROM inventory_transaction_items
      WHERE transaction_id = $1 ORDER BY created_at, id`,
    [transactionId],
  );
}

export async function createStudentBookRows(database: SqlDatabase, rows: StudentBookRow[]) {
  for (const row of rows) {
    await database.execute(
      `INSERT INTO student_books (id, scope_id, academic_year, student_id,
        book_id, semester, issued_transaction_id, created_at, reversed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, row.scopeId, row.academicYear, row.studentId, row.bookId,
        row.semester, row.issuedTransactionId, row.createdAt, row.reversedAt],
    );
  }
}

export function listActiveStudentBookRows(
  database: SqlDatabase,
  academicYear: string,
  studentId: string,
) {
  return database.select<StudentBookRow>(
    `SELECT id, scope_id AS scopeId, academic_year AS academicYear,
      student_id AS studentId, book_id AS bookId, semester,
      issued_transaction_id AS issuedTransactionId, created_at AS createdAt,
      reversed_at AS reversedAt FROM student_books
      WHERE academic_year = $1 AND student_id = $2 AND reversed_at IS NULL
      ORDER BY created_at, id`,
    [academicYear, studentId],
  );
}

export async function markInventoryTransactionReversed(
  database: SqlDatabase,
  id: string,
  reversalId: string,
) {
  await database.execute(
    "UPDATE inventory_transactions SET reversed_by_transaction_id = $1 WHERE id = $2",
    [reversalId, id],
  );
}

export async function markStudentBookRowsReversedForTransaction(
  database: SqlDatabase,
  transactionId: string,
  reversedAt: string,
) {
  await database.execute(
    `UPDATE student_books SET reversed_at = $1
      WHERE issued_transaction_id = $2 AND reversed_at IS NULL`,
    [reversedAt, transactionId],
  );
}
