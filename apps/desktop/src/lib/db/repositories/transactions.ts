import type { SqlDatabase } from "../local-db";

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
  transaction: InventoryTransactionRow,
  items: InventoryTransactionItemRow[],
): Promise<void> {
  await database.execute(
    `INSERT INTO inventory_transactions (
      id,
      scope_id,
      type,
      student_id,
      reversed_transaction_id,
      reversed_by_transaction_id,
      device_id,
      command_id,
      occurred_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      transaction.id,
      transaction.scopeId,
      transaction.type,
      transaction.studentId,
      transaction.reversedTransactionId,
      transaction.reversedByTransactionId,
      transaction.deviceId,
      transaction.commandId,
      transaction.occurredAt,
      transaction.createdAt,
    ],
  );

  for (const item of items) {
    await database.execute(
      `INSERT INTO inventory_transaction_items (
        id,
        transaction_id,
        book_id,
        quantity_delta,
        quantity_after,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        item.id,
        item.transactionId,
        item.bookId,
        item.quantityDelta,
        item.quantityAfter,
        item.createdAt,
      ],
    );
  }
}

export async function getInventoryTransactionById(
  database: SqlDatabase,
  transactionId: string,
): Promise<InventoryTransactionRow | null> {
  const rows = await database.select<InventoryTransactionRow>(
    `SELECT
      id,
      scope_id AS scopeId,
      type,
      student_id AS studentId,
      reversed_transaction_id AS reversedTransactionId,
      reversed_by_transaction_id AS reversedByTransactionId,
      device_id AS deviceId,
      command_id AS commandId,
      occurred_at AS occurredAt,
      created_at AS createdAt
    FROM inventory_transactions
    WHERE id = $1`,
    [transactionId],
  );

  return rows[0] ?? null;
}

export async function listInventoryTransactions(
  database: SqlDatabase,
): Promise<InventoryTransactionRow[]> {
  return database.select<InventoryTransactionRow>(
    `SELECT
      id,
      scope_id AS scopeId,
      type,
      student_id AS studentId,
      reversed_transaction_id AS reversedTransactionId,
      reversed_by_transaction_id AS reversedByTransactionId,
      device_id AS deviceId,
      command_id AS commandId,
      occurred_at AS occurredAt,
      created_at AS createdAt
    FROM inventory_transactions
    ORDER BY occurred_at DESC, created_at DESC, id DESC`,
  );
}

export async function listInventoryTransactionItems(
  database: SqlDatabase,
  transactionId: string,
): Promise<InventoryTransactionItemRow[]> {
  return database.select<InventoryTransactionItemRow>(
    `SELECT
      id,
      transaction_id AS transactionId,
      book_id AS bookId,
      quantity_delta AS quantityDelta,
      quantity_after AS quantityAfter,
      created_at AS createdAt
    FROM inventory_transaction_items
    WHERE transaction_id = $1
    ORDER BY created_at, id`,
    [transactionId],
  );
}

export async function createStudentBookRows(
  database: SqlDatabase,
  rows: StudentBookRow[],
): Promise<void> {
  for (const row of rows) {
    await database.execute(
      `INSERT INTO student_books (
        id,
        scope_id,
        student_id,
        book_id,
        issued_transaction_id,
        created_at,
        reversed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        row.id,
        row.scopeId,
        row.studentId,
        row.bookId,
        row.issuedTransactionId,
        row.createdAt,
        row.reversedAt,
      ],
    );
  }
}

export async function markStudentBookRowsReversedForTransaction(
  database: SqlDatabase,
  transactionId: string,
  reversedAt: string,
): Promise<void> {
  await database.execute(
    `UPDATE student_books
    SET reversed_at = $1
    WHERE issued_transaction_id = $2
      AND reversed_at IS NULL`,
    [reversedAt, transactionId],
  );
}

export async function markInventoryTransactionReversed(
  database: SqlDatabase,
  transactionId: string,
  reversedByTransactionId: string,
): Promise<void> {
  await database.execute(
    `UPDATE inventory_transactions
    SET reversed_by_transaction_id = $1
    WHERE id = $2`,
    [reversedByTransactionId, transactionId],
  );
}
