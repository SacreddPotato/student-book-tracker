import type { SyncCommand } from "@app/shared";

import type { SqlDatabase } from "../types";

export type OutboxStatus = "pending" | "syncing" | "synced" | "rejected";
export type OutboxRow = {
  id: string;
  commandType: string;
  payloadJson: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function enqueueOutboxCommand(database: SqlDatabase, row: OutboxRow) {
  await database.execute(
    `INSERT INTO sync_outbox (id, command_type, payload_json, status, attempts,
      last_error, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.id, row.commandType, row.payloadJson, row.status, row.attempts,
      row.lastError, row.createdAt, row.updatedAt],
  );
}

export function enqueueSyncCommand(
  database: SqlDatabase,
  command: SyncCommand,
  createdAt: string,
) {
  return enqueueOutboxCommand(database, {
    id: command.id,
    commandType: command.type,
    payloadJson: JSON.stringify(command),
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  });
}

const outboxSelect = `SELECT id, command_type AS commandType,
  payload_json AS payloadJson, status, attempts, last_error AS lastError,
  created_at AS createdAt, updated_at AS updatedAt FROM sync_outbox`;

export function listPendingOutboxRows(database: SqlDatabase): Promise<OutboxRow[]> {
  return database.select(
    `${outboxSelect} WHERE status = 'pending' ORDER BY created_at`,
  );
}

export function listRejectedOutboxRows(database: SqlDatabase): Promise<OutboxRow[]> {
  return database.select(
    `${outboxSelect} WHERE status = 'rejected' ORDER BY updated_at DESC, created_at DESC`,
  );
}

export async function updateOutboxStatus(
  database: SqlDatabase,
  update: Pick<OutboxRow, "id" | "status" | "lastError" | "updatedAt"> & {
    attempts?: number;
  },
) {
  await database.execute(
    `UPDATE sync_outbox SET status = $1, last_error = $2, updated_at = $3,
      attempts = COALESCE($4, attempts) WHERE id = $5`,
    [update.status, update.lastError, update.updatedAt, update.attempts ?? null, update.id],
  );
}

export async function countOutboxRowsByStatus(
  database: SqlDatabase,
  status: OutboxStatus,
) {
  const rows = await database.select<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_outbox WHERE status = $1",
    [status],
  );
  return Number(rows[0]?.count ?? 0);
}
