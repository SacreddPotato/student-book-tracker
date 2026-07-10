import type { SqlDatabase } from "../types";

export type InventoryTransactionRow = {
  id: string;
  scopeId: string;
  type: string;
  studentId: string | null;
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
  quantityDelta: number;
  quantityAfter: number;
  createdAt: string;
};

export type StudentBookRow = {
  id: string;
  scopeId: string;
  studentId: string;
  bookId: string;
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
    `INSERT INTO inventory_transactions (id, scope_id, type, student_id,
      reversed_transaction_id, reversed_by_transaction_id, device_id,
      command_id, occurred_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [row.id, row.scopeId, row.type, row.studentId, row.reversedTransactionId,
      row.reversedByTransactionId, row.deviceId, row.commandId, row.occurredAt,
      row.createdAt],
  );
  for (const item of items) {
    await database.execute(
      `INSERT INTO inventory_transaction_items (id, transaction_id, book_id,
        quantity_delta, quantity_after, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [item.id, item.transactionId, item.bookId, item.quantityDelta,
        item.quantityAfter, item.createdAt],
    );
  }
}

const transactionSelect = `SELECT id, scope_id AS scopeId, type,
  student_id AS studentId, reversed_transaction_id AS reversedTransactionId,
  reversed_by_transaction_id AS reversedByTransactionId, device_id AS deviceId,
  command_id AS commandId, occurred_at AS occurredAt, created_at AS createdAt
  FROM inventory_transactions`;

export function listInventoryTransactions(database: SqlDatabase) {
  return database.select<InventoryTransactionRow>(
    `${transactionSelect} ORDER BY occurred_at DESC, created_at DESC, id DESC`,
  );
}

export async function getInventoryTransactionById(database: SqlDatabase, id: string) {
  const rows = await database.select<InventoryTransactionRow>(
    `${transactionSelect} WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export function listInventoryTransactionItems(database: SqlDatabase, transactionId: string) {
  return database.select<InventoryTransactionItemRow>(
    `SELECT id, transaction_id AS transactionId, book_id AS bookId,
      quantity_delta AS quantityDelta, quantity_after AS quantityAfter,
      created_at AS createdAt FROM inventory_transaction_items
      WHERE transaction_id = $1 ORDER BY created_at, id`,
    [transactionId],
  );
}

export async function createStudentBookRows(database: SqlDatabase, rows: StudentBookRow[]) {
  for (const row of rows) {
    await database.execute(
      `INSERT INTO student_books (id, scope_id, student_id, book_id,
        issued_transaction_id, created_at, reversed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.scopeId, row.studentId, row.bookId, row.issuedTransactionId,
        row.createdAt, row.reversedAt],
    );
  }
}

export function listActiveStudentBookRows(database: SqlDatabase, studentId: string) {
  return database.select<StudentBookRow>(
    `SELECT id, scope_id AS scopeId, student_id AS studentId, book_id AS bookId,
      issued_transaction_id AS issuedTransactionId, created_at AS createdAt,
      reversed_at AS reversedAt FROM student_books
      WHERE student_id = $1 AND reversed_at IS NULL ORDER BY created_at, id`,
    [studentId],
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
