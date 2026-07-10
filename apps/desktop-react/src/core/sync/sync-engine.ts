import type { SyncCommand, SyncCommandResult } from "@app/shared";

import { runLocalTransaction } from "../db/local-transaction";
import { upsertBook, type BookRow } from "../db/repositories/books";
import {
  countOutboxRowsByStatus,
  listPendingOutboxRows,
  updateOutboxStatus,
  type OutboxRow,
} from "../db/repositories/outbox";
import { upsertStudent, type StudentRow } from "../db/repositories/students";
import { getSyncState, saveSyncState } from "../db/repositories/sync-state";
import {
  getInventoryTransactionByCommandId,
  getInventoryTransactionById,
  upsertSyncedInventoryTransaction,
  upsertSyncedInventoryTransactionItem,
  upsertSyncedStudentBook,
  type InventoryTransactionItemRow,
  type InventoryTransactionRow,
  type StudentBookRow,
} from "../db/repositories/transactions";
import type { SqlDatabase } from "../db/types";
import type { ExternalStore } from "../state/external-store";
import type { PulledChange, SyncApiClient } from "./api-client";

export type SyncPhase = "idle" | "syncing" | "synced" | "offline" | "rejected" | "error";
export type SyncStatus = {
  phase: SyncPhase;
  pendingCount: number;
  rejectedCount: number;
  unacknowledgedRejectedCount: number;
  lastSyncedAt: string | null;
  message: string | null;
};

export const initialSyncStatus: SyncStatus = {
  phase: "idle",
  pendingCount: 0,
  rejectedCount: 0,
  unacknowledgedRejectedCount: 0,
  lastSyncedAt: null,
  message: null,
};

export class SyncEngine {
  private readonly now: () => string;

  constructor(private readonly options: {
    database: SqlDatabase;
    client: SyncApiClient;
    store: ExternalStore<SyncStatus>;
    now?: () => string;
  }) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async sync(): Promise<void> {
    await this.refresh("syncing", null);
    try {
      const pending = await listPendingOutboxRows(this.options.database);
      const commands = await this.prepareCommands(pending);
      if (commands.length) {
        const results = await this.options.client.push(commands);
        await this.applyPushResults(pending, results);
      }
      await this.pullChanges();
      const rejected = await countOutboxRowsByStatus(this.options.database, "rejected");
      await this.refresh(
        rejected ? "rejected" : "synced",
        rejected ? "A sync command was rejected." : null,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      const state = await getSyncState(this.options.database);
      await runLocalTransaction(this.options.database, (database) =>
        saveSyncState(database, { ...state, lastError: message }),
      );
      await this.refresh(isOfflineError(error) ? "offline" : "error", message);
    }
  }

  private async prepareCommands(rows: OutboxRow[]): Promise<SyncCommand[]> {
    const commands: SyncCommand[] = [];
    for (const row of rows) {
      try {
        const command = JSON.parse(row.payloadJson) as SyncCommand;
        commands.push(await normaliseCommand(this.options.database, command));
      } catch (error) {
        await runLocalTransaction(this.options.database, (database) =>
          updateOutboxStatus(database, {
            id: row.id,
            status: "rejected",
            lastError: error instanceof Error ? error.message : "Invalid sync command.",
            updatedAt: this.now(),
            attempts: row.attempts + 1,
          }),
        );
      }
    }
    return commands;
  }

  private async applyPushResults(rows: OutboxRow[], results: SyncCommandResult[]) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const resultIds = new Set(results.map(({ commandId }) => commandId));
    await runLocalTransaction(this.options.database, async (database) => {
      for (const result of results) {
        const row = byId.get(result.commandId);
        if (!row) throw new Error(`Unknown sync result: ${result.commandId}`);
        const accepted = result.status === "accepted" || result.status === "duplicate";
        await updateOutboxStatus(database, {
          id: row.id,
          status: accepted ? "synced" : "rejected",
          lastError: accepted ? null : formatRejected(result),
          updatedAt: this.now(),
          attempts: row.attempts + 1,
        });
      }
    });
    const missing = rows.find((row) => !resultIds.has(row.id) && isValidCommand(row.payloadJson));
    if (missing) throw new Error(`Missing sync result: ${missing.id}`);
  }

  private async pullChanges() {
    const state = await getSyncState(this.options.database);
    let cursor = state.pullCursor;
    while (true) {
      const response = await this.options.client.pull(cursor);
      await runLocalTransaction(this.options.database, async (database) => {
        await applyPulledChanges(database, response.changes);
        await saveSyncState(database, {
          id: state.id,
          pullCursor: response.nextCursor,
          lastSyncedAt: this.now(),
          lastError: null,
        });
      });
      if (!response.changes.length || response.nextCursor === cursor) return;
      cursor = response.nextCursor;
    }
  }

  private async refresh(phase: SyncPhase, message: string | null) {
    const [pendingCount, rejectedCount, state] = await Promise.all([
      countOutboxRowsByStatus(this.options.database, "pending"),
      countOutboxRowsByStatus(this.options.database, "rejected"),
      getSyncState(this.options.database),
    ]);
    this.options.store.update({
      phase,
      pendingCount,
      rejectedCount,
      unacknowledgedRejectedCount: rejectedCount,
      lastSyncedAt: state.lastSyncedAt,
      message,
    });
  }
}

async function normaliseCommand(database: SqlDatabase, command: SyncCommand) {
  if (command.type !== "REVERSE_TRANSACTION") return command;
  const transaction = await getInventoryTransactionById(database, command.transactionId);
  if (!transaction) throw new Error(`Unknown local transaction: ${command.transactionId}`);
  return { ...command, transactionId: transaction.commandId };
}

async function applyPulledChanges(database: SqlDatabase, changes: PulledChange[]) {
  const transactions = new Map<string, { localId: string; alreadyPresent: boolean }>();
  for (const change of changes) {
    const payload = parse(change.payloadJson);
    if (!payload) continue;
    switch (change.entityTable) {
      case "students":
        if (isStudent(payload)) await upsertStudent(database, payload);
        break;
      case "books":
        if (isBook(payload)) await upsertBook(database, payload);
        break;
      case "inventory_transactions":
        if (isTransaction(payload)) {
          const row = await resolveReferences(database, payload, transactions);
          const synced = await upsertSyncedInventoryTransaction(database, row);
          transactions.set(payload.id, {
            localId: synced.transactionId,
            alreadyPresent: synced.alreadyPresent,
          });
        }
        break;
      case "inventory_transaction_items":
        if (isItem(payload)) {
          const transaction = await mappedTransaction(database, payload.transactionId, transactions);
          if (transaction && !transaction.alreadyPresent) {
            await upsertSyncedInventoryTransactionItem(database, {
              ...payload,
              transactionId: transaction.localId,
            });
          }
        }
        break;
      case "student_books":
        if (isStudentBook(payload)) {
          const transaction = await mappedTransaction(
            database,
            payload.issuedTransactionId,
            transactions,
          );
          if (transaction && !transaction.alreadyPresent) {
            await upsertSyncedStudentBook(database, {
              ...payload,
              issuedTransactionId: transaction.localId,
            });
          }
        }
        break;
    }
  }
}

async function resolveReferences(
  database: SqlDatabase,
  row: InventoryTransactionRow,
  transactions: Map<string, { localId: string; alreadyPresent: boolean }>,
): Promise<InventoryTransactionRow> {
  return {
    ...row,
    reversedTransactionId: await resolveId(database, row.reversedTransactionId, transactions),
    reversedByTransactionId: await resolveId(database, row.reversedByTransactionId, transactions),
  };
}

async function resolveId(
  database: SqlDatabase,
  id: string | null,
  transactions: Map<string, { localId: string; alreadyPresent: boolean }>,
) {
  if (!id) return null;
  return (await mappedTransaction(database, id, transactions))?.localId ?? id;
}

async function mappedTransaction(
  database: SqlDatabase,
  remoteId: string,
  transactions: Map<string, { localId: string; alreadyPresent: boolean }>,
) {
  const mapped = transactions.get(remoteId);
  if (mapped) return mapped;
  const existing = await getInventoryTransactionByCommandId(database, remoteId);
  return existing ? { localId: existing.id, alreadyPresent: true } : null;
}

function parse(json: string): unknown {
  try { return JSON.parse(json); } catch { return null; }
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isStudent(value: unknown): value is StudentRow {
  return record(value) && typeof value.id === "string" && typeof value.name === "string";
}
function isBook(value: unknown): value is BookRow {
  return record(value) && typeof value.id === "string" && typeof value.name === "string";
}
function isTransaction(value: unknown): value is InventoryTransactionRow {
  return record(value) && typeof value.id === "string" && typeof value.commandId === "string";
}
function isItem(value: unknown): value is InventoryTransactionItemRow {
  return record(value) && typeof value.id === "string" && typeof value.transactionId === "string";
}
function isStudentBook(value: unknown): value is StudentBookRow {
  return record(value) && typeof value.id === "string" && typeof value.issuedTransactionId === "string";
}
function formatRejected(result: SyncCommandResult) {
  return [result.reasonCode, result.message].filter(Boolean).join(": ")
    || "Sync command rejected.";
}
function isValidCommand(json: string) {
  try { return typeof (JSON.parse(json) as { id?: unknown }).id === "string"; }
  catch { return false; }
}
function isOfflineError(error: unknown) {
  return (error instanceof TypeError && !/database|transaction|sqlite|locked/i.test(error.message))
    || (error instanceof Error && /network|fetch/i.test(error.message));
}
