import type { SyncCommand, SyncCommandResult } from "@app/shared";

import type { SqlDatabase } from "$lib/db/local-db";
import { initializeLocalDatabase } from "$lib/db/local-db";
import { runLocalTransaction } from "$lib/db/local-transaction";
import { upsertBook, type BookRow } from "$lib/db/repositories/books";
import {
  countOutboxRowsByStatus,
  listPendingOutboxRows,
  updateOutboxStatus,
  type OutboxRow,
} from "$lib/db/repositories/outbox";
import { upsertStudent, type StudentRow } from "$lib/db/repositories/students";
import { getSyncState, saveSyncState } from "$lib/db/repositories/sync-state";
import {
  getInventoryTransactionById,
  getInventoryTransactionByCommandId,
  upsertSyncedInventoryTransaction,
  upsertSyncedInventoryTransactionItem,
  upsertSyncedStudentBook,
  type InventoryTransactionItemRow,
  type InventoryTransactionRow,
  type StudentBookRow,
} from "$lib/db/repositories/transactions";

import {
  FetchSyncApiClient,
  getSyncRuntimeConfig,
  type PulledChange,
  type SyncApiClient,
} from "./api-client";
import { setSyncStatus } from "./sync-status";

type SyncEngineOptions = {
  database?: SqlDatabase;
  client?: SyncApiClient;
  now?: () => string;
};

type RemoteTransaction = InventoryTransactionRow;
type RemoteItem = InventoryTransactionItemRow;
type RemoteStudentBook = StudentBookRow;

export class SyncEngine {
  private readonly now: () => string;

  constructor(private readonly options: SyncEngineOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async sync(): Promise<void> {
    const database = this.options.database ?? (await initializeLocalDatabase());
    const client = this.options.client ?? this.createClient();

    if (!client) {
      await this.refreshStatus(database, "idle", null);
      return;
    }

    await this.refreshStatus(database, "syncing", null);

    try {
      const pendingRows = await listPendingOutboxRows(database);
      const commands = await this.prepareCommands(database, pendingRows);

      if (commands.length > 0) {
        const results = await client.push(commands);
        await this.applyPushResults(database, pendingRows, results);
      }

      await this.pullChanges(database, client);
      const rejectedCount = await countOutboxRowsByStatus(database, "rejected");
      await this.refreshStatus(
        database,
        rejectedCount > 0 ? "rejected" : "synced",
        rejectedCount > 0 ? "A sync command was rejected." : null,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      const state = await getSyncState(database);
      await runLocalTransaction(database, async (transaction) => {
        await saveSyncState(transaction, { ...state, lastError: message });
      });
      await this.refreshStatus(database, isOfflineError(error) ? "offline" : "error", message);
    }
  }

  private createClient(): SyncApiClient | null {
    const config = getSyncRuntimeConfig();
    return config.apiBaseUrl ? new FetchSyncApiClient(config) : null;
  }

  private async prepareCommands(
    database: SqlDatabase,
    pendingRows: OutboxRow[],
  ): Promise<SyncCommand[]> {
    const commands: SyncCommand[] = [];

    for (const row of pendingRows) {
      try {
        const command = JSON.parse(row.payloadJson) as SyncCommand;
        commands.push(await normaliseCommandForRemote(database, command));
      } catch (error) {
        await runLocalTransaction(database, async (transaction) => {
          await updateOutboxStatus(transaction, {
            id: row.id,
            status: "rejected",
            lastError: error instanceof Error ? error.message : "Invalid sync command.",
            updatedAt: this.now(),
            attempts: row.attempts + 1,
          });
        });
      }
    }

    return commands;
  }

  private async applyPushResults(
    database: SqlDatabase,
    pendingRows: OutboxRow[],
    results: SyncCommandResult[],
  ): Promise<void> {
    const rowsById = new Map(pendingRows.map((row) => [row.id, row]));
    const resultIds = new Set(results.map((result) => result.commandId));

    await runLocalTransaction(database, async (transaction) => {
      for (const result of results) {
        const row = rowsById.get(result.commandId);
        if (!row) {
          throw new Error(`Sync API returned an unknown command result: ${result.commandId}`);
        }

        const accepted = result.status === "accepted" || result.status === "duplicate";
        await updateOutboxStatus(transaction, {
          id: row.id,
          status: accepted ? "synced" : "rejected",
          lastError: accepted ? null : formatRejectedResult(result),
          updatedAt: this.now(),
          attempts: row.attempts + 1,
        });
      }
    });

    const missingResult = pendingRows.find(
      (row) => !resultIds.has(row.id) && isValidCommandJson(row.payloadJson),
    );
    if (missingResult) {
      throw new Error(`Sync API did not return a result for command: ${missingResult.id}`);
    }
  }

  private async pullChanges(database: SqlDatabase, client: SyncApiClient): Promise<void> {
    const state = await getSyncState(database);
    let cursor = state.pullCursor;

    while (true) {
      const response = await client.pull(cursor);
      await runLocalTransaction(database, async (transaction) => {
        await applyPulledChanges(transaction, response.changes);
        await saveSyncState(transaction, {
          id: state.id,
          pullCursor: response.nextCursor,
          lastSyncedAt: this.now(),
          lastError: null,
        });
      });

      if (response.changes.length === 0 || response.nextCursor === cursor) {
        return;
      }

      cursor = response.nextCursor;
    }
  }

  private async refreshStatus(
    database: SqlDatabase,
    phase: "idle" | "syncing" | "synced" | "offline" | "rejected" | "error",
    message: string | null,
  ): Promise<void> {
    const [pendingCount, rejectedCount, state] = await Promise.all([
      countOutboxRowsByStatus(database, "pending"),
      countOutboxRowsByStatus(database, "rejected"),
      getSyncState(database),
    ]);

    setSyncStatus({
      phase,
      pendingCount,
      rejectedCount,
      lastSyncedAt: state.lastSyncedAt,
      message,
    });
  }
}

async function normaliseCommandForRemote(
  database: SqlDatabase,
  command: SyncCommand,
): Promise<SyncCommand> {
  if (command.type !== "REVERSE_TRANSACTION") {
    return command;
  }

  const transaction = await getInventoryTransactionById(database, command.transactionId);
  if (!transaction) {
    throw new Error(`Unknown local transaction: ${command.transactionId}`);
  }

  return { ...command, transactionId: transaction.commandId };
}

async function applyPulledChanges(database: SqlDatabase, changes: PulledChange[]): Promise<void> {
  const transactions = new Map<string, { localId: string; alreadyPresent: boolean }>();

  for (const change of changes) {
    const payload = parsePayload(change);

    switch (change.entityTable) {
      case "students":
        if (isStudentRow(payload)) {
          await upsertStudent(database, payload);
        }
        break;
      case "books":
        if (isBookRow(payload)) {
          await upsertBook(database, payload);
        }
        break;
      case "inventory_transactions":
        if (isTransactionRow(payload)) {
          const transaction = await resolveTransactionReferences(database, payload, transactions);
          const synced = await upsertSyncedInventoryTransaction(database, transaction);
          transactions.set(payload.id, {
            localId: synced.transactionId,
            alreadyPresent: synced.alreadyPresent,
          });
        }
        break;
      case "inventory_transaction_items":
        if (isItemRow(payload)) {
          const transaction = await getMappedTransaction(database, payload.transactionId, transactions);
          if (transaction && !transaction.alreadyPresent) {
            await upsertSyncedInventoryTransactionItem(database, {
              ...payload,
              transactionId: transaction.localId,
            });
          }
        }
        break;
      case "student_books":
        if (isStudentBookRow(payload)) {
          const transaction = await getMappedTransaction(
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

async function resolveTransactionReferences(
  database: SqlDatabase,
  transaction: RemoteTransaction,
  transactions: Map<string, { localId: string; alreadyPresent: boolean }>,
): Promise<RemoteTransaction> {
  return {
    ...transaction,
    reversedTransactionId: await resolveTransactionId(
      database,
      transaction.reversedTransactionId,
      transactions,
    ),
    reversedByTransactionId: await resolveTransactionId(
      database,
      transaction.reversedByTransactionId,
      transactions,
    ),
  };
}

async function resolveTransactionId(
  database: SqlDatabase,
  remoteId: string | null,
  transactions: Map<string, { localId: string; alreadyPresent: boolean }>,
): Promise<string | null> {
  if (!remoteId) {
    return null;
  }

  return (await getMappedTransaction(database, remoteId, transactions))?.localId ?? remoteId;
}

async function getMappedTransaction(
  database: SqlDatabase,
  remoteId: string,
  transactions: Map<string, { localId: string; alreadyPresent: boolean }>,
): Promise<{ localId: string; alreadyPresent: boolean } | null> {
  const mapped = transactions.get(remoteId);
  if (mapped) {
    return mapped;
  }

  const existing = await getInventoryTransactionByCommandId(database, remoteId);
  return existing ? { localId: existing.id, alreadyPresent: true } : null;
}

function parsePayload(change: PulledChange): unknown {
  try {
    return JSON.parse(change.payloadJson);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStudentRow(value: unknown): value is StudentRow {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isBookRow(value: unknown): value is BookRow {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isTransactionRow(value: unknown): value is RemoteTransaction {
  return isRecord(value) && typeof value.id === "string" && typeof value.commandId === "string";
}

function isItemRow(value: unknown): value is RemoteItem {
  return isRecord(value) && typeof value.id === "string" && typeof value.transactionId === "string";
}

function isStudentBookRow(value: unknown): value is RemoteStudentBook {
  return isRecord(value) && typeof value.id === "string" && typeof value.issuedTransactionId === "string";
}

function formatRejectedResult(result: SyncCommandResult): string {
  return [result.reasonCode, result.message].filter(Boolean).join(": ") || "Sync command rejected.";
}

function isValidCommandJson(payloadJson: string): boolean {
  try {
    const command = JSON.parse(payloadJson) as { id?: unknown };
    return typeof command.id === "string";
  } catch {
    return false;
  }
}

function isOfflineError(error: unknown): boolean {
  return (
    error instanceof TypeError && !/database|transaction|sqlite|locked/i.test(error.message)
  ) || (error instanceof Error && /network|fetch/i.test(error.message));
}
