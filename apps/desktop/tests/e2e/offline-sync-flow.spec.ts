import { expect, test } from "@playwright/test";

import type { SyncCommandResult } from "@app/shared";

import { runMigrations } from "../../src/lib/db/migrations";
import { enqueueSyncCommand } from "../../src/lib/db/repositories/outbox";
import { getSyncState } from "../../src/lib/db/repositories/sync-state";
import type { PullResponse, SyncApiClient } from "../../src/lib/sync/api-client";
import { SyncEngine } from "../../src/lib/sync/sync-engine";
import type { LegacySyncCommand } from "../../src/lib/sync/legacy-sync-command";

import { TestSqliteDatabase } from "./test-database";

const now = "2026-07-10T12:00:00.000Z";

class ScenarioSyncClient implements SyncApiClient {
  constructor(
    private readonly result: SyncCommandResult | null,
    private readonly failure: Error | null = null,
  ) {}

  pushed: LegacySyncCommand[] = [];

  async push(commands: LegacySyncCommand[]): Promise<SyncCommandResult[]> {
    this.pushed = commands;
    if (this.failure) {
      throw this.failure;
    }

    return this.result ? [this.result] : [];
  }

  async pull(since: string | null): Promise<PullResponse> {
    return { changes: [], nextCursor: since ?? "0" };
  }
}

async function status(
  database: TestSqliteDatabase,
  commandId = "stock-command",
): Promise<{ status: string; lastError: string | null }> {
  const rows = await database.select<{ status: string; lastError: string | null }>(
    "SELECT status, last_error AS lastError FROM sync_outbox WHERE id = $1",
    [commandId],
  );
  return rows[0] ?? { status: "missing", lastError: null };
}

test("offline queue survives a failed sync, then accepts or preserves a stock conflict", async () => {
  const database = new TestSqliteDatabase();
  await runMigrations(database);
  const command: LegacySyncCommand = {
    id: "stock-command",
    type: "ADD_BOOK_STOCK",
    deviceId: "e2e-device",
    occurredAt: now,
    bookId: "book-1",
    quantity: 3,
  };
  await enqueueSyncCommand(database, command, now);

  await new SyncEngine({
    database,
    client: new ScenarioSyncClient(null, new TypeError("fetch failed")),
    now: () => now,
  }).sync();
  expect(await status(database)).toEqual({ status: "pending", lastError: null });
  expect((await getSyncState(database)).lastError).toBe("fetch failed");

  await new SyncEngine({
    database,
    client: new ScenarioSyncClient({ commandId: command.id, status: "accepted" }),
    now: () => now,
  }).sync();
  expect(await status(database)).toEqual({ status: "synced", lastError: null });

  const rejectedCommand = { ...command, id: "rejected-command" } as LegacySyncCommand;
  await enqueueSyncCommand(database, rejectedCommand, now);
  await new SyncEngine({
    database,
    client: new ScenarioSyncClient({
      commandId: rejectedCommand.id,
      status: "rejected",
      reasonCode: "INSUFFICIENT_STOCK",
      message: "Insufficient stock for book: book-1",
    }),
    now: () => now,
  }).sync();
  expect(await status(database, rejectedCommand.id)).toEqual({
    status: "rejected",
    lastError: "INSUFFICIENT_STOCK: Insufficient stock for book: book-1",
  });

  database.close();
});
