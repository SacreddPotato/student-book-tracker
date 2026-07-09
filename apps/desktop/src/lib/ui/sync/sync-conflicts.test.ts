// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { DatabaseSync } from "node:sqlite";
import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SyncCommand } from "@app/shared";

import type { SqlDatabase, SqlValue } from "$lib/db/local-db";
import { runMigrations } from "$lib/db/migrations";
import { upsertBook } from "$lib/db/repositories/books";
import { enqueueOutboxCommand } from "$lib/db/repositories/outbox";
import { upsertStudent } from "$lib/db/repositories/students";
import { initialSyncStatus, syncStatus } from "$lib/sync/sync-status";

import SyncConflictsPanel from "./SyncConflictsPanel.svelte";

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

function toSqliteBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}

const now = "2026-07-09T12:00:00.000Z";

async function seedRejectedIssue(database: SqlDatabase): Promise<void> {
  await upsertStudent(database, {
    id: "student-1",
    scopeId: "global",
    name: "Mona Ahmed",
    governmentId: "29801011234567",
    educationStage: "primary",
    gradeLevel: "primary1",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await upsertBook(database, {
    id: "book-1",
    scopeId: "global",
    name: "Primary Math",
    educationStage: "primary",
    quantity: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await upsertBook(database, {
    id: "book-2",
    scopeId: "global",
    name: "Primary Science",
    educationStage: "primary",
    quantity: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  const command: SyncCommand = {
    id: "issue-command",
    type: "ISSUE_BOOKS_TO_STUDENT",
    deviceId: "device-a",
    occurredAt: now,
    studentId: "student-1",
    bookIds: ["book-1", "book-2"],
  };
  await enqueueOutboxCommand(database, {
    id: command.id,
    commandType: command.type,
    payloadJson: JSON.stringify(command),
    status: "rejected",
    attempts: 1,
    lastError: "INSUFFICIENT_STOCK: Insufficient stock for book: book-1",
    createdAt: now,
    updatedAt: now,
  });
}

describe("SyncConflictsPanel", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = new TestSqliteDatabase();
    await runMigrations(database);
    syncStatus.set({ ...initialSyncStatus, phase: "rejected", rejectedCount: 1 });
    await seedRejectedIssue(database);
  });

  afterEach(() => {
    database.close();
  });

  it("shows the affected student and books for a rejected insufficient-stock issue", async () => {
    render(SyncConflictsPanel, { props: { database, now: () => now } });

    expect(await screen.findByRole("region", { name: "Sync conflicts" })).toBeInTheDocument();
    expect(screen.getByText("Insufficient stock")).toBeInTheDocument();
    expect(screen.getByText("Mona Ahmed")).toBeInTheDocument();
    expect(screen.getByText("Primary Math, Primary Science")).toBeInTheDocument();
    expect(screen.getByText(/INSUFFICIENT_STOCK/)).toBeInTheDocument();
  });

  it("acknowledges a warning without deleting the rejected audit row", async () => {
    const user = userEvent.setup();
    render(SyncConflictsPanel, { props: { database, now: () => now } });

    await screen.findByRole("region", { name: "Sync conflicts" });
    await user.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Sync conflicts" })).not.toBeInTheDocument(),
    );
    expect(
      await database.select<{ status: string }>(
        "SELECT status FROM sync_outbox WHERE id = $1",
        ["issue-command"],
      ),
    ).toEqual([{ status: "rejected" }]);
    expect(
      await database.select<{ valueJson: string }>(
        "SELECT value_json AS valueJson FROM app_settings WHERE key = $1",
        ["sync.acknowledged-conflict-ids"],
      ),
    ).toEqual([{ valueJson: '["issue-command"]' }]);
  });
});
