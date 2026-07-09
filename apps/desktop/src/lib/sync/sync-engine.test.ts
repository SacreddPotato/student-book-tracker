import { DatabaseSync } from "node:sqlite";
import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncCommand, SyncCommandResult } from "@app/shared";

import type { SqlDatabase, SqlValue } from "$lib/db/local-db";
import { runMigrations } from "$lib/db/migrations";
import { getBookById } from "$lib/db/repositories/books";
import { enqueueSyncCommand } from "$lib/db/repositories/outbox";
import { getSyncState } from "$lib/db/repositories/sync-state";
import { createInventoryTransaction } from "$lib/db/repositories/transactions";

import type { PullResponse, SyncApiClient } from "./api-client";
import { SyncEngine } from "./sync-engine";
import { initialSyncStatus, syncStatus } from "./sync-status";

class TestSqliteDatabase implements SqlDatabase {
  readonly db = new DatabaseSync(":memory:");

  async execute(sql: string, values: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(toSqliteBindings(values));
  }

  async select<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(toSqliteBindings(values)) as T[];
  }

  close(): void {
    this.db.close();
  }
}

class FakeSyncApiClient implements SyncApiClient {
  constructor(
    private readonly results: SyncCommandResult[] = [],
    private readonly pulls: PullResponse[] = [],
    private readonly pushError: Error | null = null,
  ) {}

  readonly push = vi.fn(async (_commands: SyncCommand[]) => {
    if (this.pushError) {
      throw this.pushError;
    }
    return this.results;
  });

  readonly pull = vi.fn(async (_since: string | null) =>
    this.pulls.shift() ?? { changes: [], nextCursor: _since ?? "0" },
  );
}

function toSqliteBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}

const now = "2026-07-09T12:00:00.000Z";

function stockCommand(id = "stock-command"): SyncCommand {
  return {
    id,
    type: "ADD_BOOK_STOCK",
    deviceId: "device-a",
    occurredAt: now,
    bookId: "book-1",
    quantity: 3,
  };
}

async function outboxRow(database: SqlDatabase, id: string) {
  const rows = await database.select<{
    status: string;
    lastError: string | null;
    attempts: number;
  }>(
    "SELECT status, last_error AS lastError, attempts FROM sync_outbox WHERE id = $1",
    [id],
  );
  return rows[0];
}

describe("SyncEngine", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = new TestSqliteDatabase();
    await runMigrations(database);
    syncStatus.set(initialSyncStatus);
  });

  afterEach(() => {
    database.close();
  });

  it("preserves the pending outbox command when the sync API is offline", async () => {
    await enqueueSyncCommand(database, stockCommand(), now);
    const client = new FakeSyncApiClient([], [], new TypeError("fetch failed"));

    await new SyncEngine({ database, client, now: () => now }).sync();

    expect(await outboxRow(database, "stock-command")).toMatchObject({ status: "pending" });
    expect((await getSyncState(database)).lastError).toBe("fetch failed");
    expect(get(syncStatus).phase).toBe("offline");
  });

  it("marks accepted commands as synced after a successful push and pull", async () => {
    await enqueueSyncCommand(database, stockCommand(), now);
    const client = new FakeSyncApiClient(
      [{ commandId: "stock-command", status: "accepted" }],
      [{ changes: [], nextCursor: "0" }],
    );

    await new SyncEngine({ database, client, now: () => now }).sync();

    expect(await outboxRow(database, "stock-command")).toEqual({
      status: "synced",
      lastError: null,
      attempts: 1,
    });
    expect(client.push).toHaveBeenCalledWith([stockCommand()]);
    expect(client.pull).toHaveBeenCalledWith(null);
    expect(get(syncStatus).phase).toBe("synced");
  });

  it("marks rejected commands for review and preserves the server rejection reason", async () => {
    await enqueueSyncCommand(database, stockCommand(), now);
    const client = new FakeSyncApiClient(
      [
        {
          commandId: "stock-command",
          status: "rejected",
          reasonCode: "INSUFFICIENT_STOCK",
          message: "Insufficient stock for book: book-1",
        },
      ],
      [{ changes: [], nextCursor: "0" }],
    );

    await new SyncEngine({ database, client, now: () => now }).sync();

    expect(await outboxRow(database, "stock-command")).toEqual({
      status: "rejected",
      lastError: "INSUFFICIENT_STOCK: Insufficient stock for book: book-1",
      attempts: 1,
    });
    expect(get(syncStatus)).toMatchObject({ phase: "rejected", rejectedCount: 1 });
  });

  it("uses the original command ID when pushing a local reversal", async () => {
    await createInventoryTransaction(
      database,
      {
        id: "local-transaction",
        scopeId: "global",
        type: "stock_increase",
        studentId: null,
        reversedTransactionId: null,
        reversedByTransactionId: null,
        deviceId: "device-a",
        commandId: "original-command",
        occurredAt: now,
        createdAt: now,
      },
      [],
    );
    await enqueueSyncCommand(
      database,
      {
        id: "reverse-command",
        type: "REVERSE_TRANSACTION",
        deviceId: "device-a",
        occurredAt: now,
        transactionId: "local-transaction",
      },
      now,
    );
    const client = new FakeSyncApiClient(
      [{ commandId: "reverse-command", status: "accepted" }],
      [{ changes: [], nextCursor: "0" }],
    );

    await new SyncEngine({ database, client, now: () => now }).sync();

    expect(client.push).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "reverse-command",
        transactionId: "original-command",
      }),
    ]);
  });

  it("applies pulled remote snapshots and advances the local pull cursor", async () => {
    const client = new FakeSyncApiClient([], [
      {
        changes: [
          {
            sequence: 1,
            commandId: "remote-book-command",
            entityTable: "books",
            entityId: "book-1",
            payloadJson: JSON.stringify({
              id: "book-1",
              scopeId: "global",
              name: "Primary Math",
              educationStage: "primary",
              quantity: 7,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            }),
            createdAt: now,
          },
        ],
        nextCursor: "1",
      },
      { changes: [], nextCursor: "1" },
    ]);

    await new SyncEngine({ database, client, now: () => now }).sync();

    expect(await getBookById(database, "book-1")).toMatchObject({
      name: "Primary Math",
      quantity: 7,
    });
    expect(await getSyncState(database)).toMatchObject({
      pullCursor: "1",
      lastSyncedAt: now,
      lastError: null,
    });
    expect(client.push).not.toHaveBeenCalled();
  });
});
