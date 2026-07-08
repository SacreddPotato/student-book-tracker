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
    ORDER BY occurred_at DESC, created_at DESC`,
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
