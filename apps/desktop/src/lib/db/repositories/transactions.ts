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

export async function getInventoryTransactionByCommandId(
  database: SqlDatabase,
  commandId: string,
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
    WHERE command_id = $1`,
    [commandId],
  );

  return rows[0] ?? null;
}

export type SyncedTransactionResult = {
  transactionId: string;
  alreadyPresent: boolean;
};

export async function upsertSyncedInventoryTransaction(
  database: SqlDatabase,
  transaction: InventoryTransactionRow,
): Promise<SyncedTransactionResult> {
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
    WHERE id = $1 OR command_id = $2 OR command_id = $3`,
    [transaction.id, transaction.commandId, transaction.id],
  );
  const existing = rows[0];

  if (!existing) {
    await createInventoryTransaction(database, transaction, []);
    return { transactionId: transaction.id, alreadyPresent: false };
  }

  await database.execute(
    `UPDATE inventory_transactions
    SET scope_id = $1,
      type = $2,
      student_id = $3,
      reversed_transaction_id = $4,
      reversed_by_transaction_id = $5,
      device_id = $6,
      command_id = $7,
      occurred_at = $8,
      created_at = $9
    WHERE id = $10`,
    [
      transaction.scopeId,
      transaction.type,
      transaction.studentId,
      transaction.reversedTransactionId,
      transaction.reversedByTransactionId,
      transaction.deviceId,
      existing.commandId === transaction.commandId ? transaction.commandId : existing.commandId,
      transaction.occurredAt,
      transaction.createdAt,
      existing.id,
    ],
  );

  return { transactionId: existing.id, alreadyPresent: true };
}

export async function upsertSyncedInventoryTransactionItem(
  database: SqlDatabase,
  item: InventoryTransactionItemRow,
): Promise<void> {
  await database.execute(
    `INSERT INTO inventory_transaction_items (
      id,
      transaction_id,
      book_id,
      quantity_delta,
      quantity_after,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT(id) DO UPDATE SET
      transaction_id = excluded.transaction_id,
      book_id = excluded.book_id,
      quantity_delta = excluded.quantity_delta,
      quantity_after = excluded.quantity_after,
      created_at = excluded.created_at`,
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

export async function upsertSyncedStudentBook(
  database: SqlDatabase,
  row: StudentBookRow,
): Promise<void> {
  await database.execute(
    `INSERT INTO student_books (
      id,
      scope_id,
      student_id,
      book_id,
      issued_transaction_id,
      created_at,
      reversed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(id) DO UPDATE SET
      scope_id = excluded.scope_id,
      student_id = excluded.student_id,
      book_id = excluded.book_id,
      issued_transaction_id = excluded.issued_transaction_id,
      created_at = excluded.created_at,
      reversed_at = excluded.reversed_at`,
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

export async function listActiveStudentBookRows(
  database: SqlDatabase,
  studentId: string,
): Promise<StudentBookRow[]> {
  return database.select<StudentBookRow>(
    `SELECT
      id,
      scope_id AS scopeId,
      student_id AS studentId,
      book_id AS bookId,
      issued_transaction_id AS issuedTransactionId,
      created_at AS createdAt,
      reversed_at AS reversedAt
    FROM student_books
    WHERE student_id = $1
      AND reversed_at IS NULL
    ORDER BY created_at, id`,
    [studentId],
  );
}
