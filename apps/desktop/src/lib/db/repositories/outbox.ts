import type { SyncCommand } from "@app/shared";

import type { SqlDatabase } from "../local-db";

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

export async function enqueueOutboxCommand(database: SqlDatabase, row: OutboxRow): Promise<void> {
  await database.execute(
    `INSERT INTO sync_outbox (
      id,
      command_type,
      payload_json,
      status,
      attempts,
      last_error,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.id,
      row.commandType,
      row.payloadJson,
      row.status,
      row.attempts,
      row.lastError,
      row.createdAt,
      row.updatedAt,
    ],
  );
}

export async function enqueueSyncCommand(
  database: SqlDatabase,
  command: SyncCommand,
  createdAt: string,
): Promise<void> {
  await enqueueOutboxCommand(database, {
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

export async function listPendingOutboxRows(database: SqlDatabase): Promise<OutboxRow[]> {
  return database.select<OutboxRow>(
    `SELECT
      id,
      command_type AS commandType,
      payload_json AS payloadJson,
      status,
      attempts,
      last_error AS lastError,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_outbox
    WHERE status = 'pending'
    ORDER BY created_at`,
  );
}

export async function updateOutboxStatus(
  database: SqlDatabase,
  update: Pick<OutboxRow, "id" | "status" | "lastError" | "updatedAt">,
): Promise<void> {
  await database.execute(
    "UPDATE sync_outbox SET status = $1, last_error = $2, updated_at = $3 WHERE id = $4",
    [update.status, update.lastError, update.updatedAt, update.id],
  );
}
