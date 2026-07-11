import type { SyncCommand, SyncCommandResult } from "@app/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import { runMigrations } from "../db/migrations";
import { createInitialAcademicYear, listAcademicYears } from "../db/repositories/academic-years";
import { getBookById, upsertBook } from "../db/repositories/books";
import { countOutboxRowsByStatus } from "../db/repositories/outbox";
import { listStudents } from "../db/repositories/students";
import {
  listActiveStudentBookRows,
  listInventoryTransactionItems,
  listInventoryTransactions,
} from "../db/repositories/transactions";
import { addBookStock, reverseTransaction } from "../services/inventory-service";
import { createExternalStore } from "../state/external-store";
import type { PullResponse, SyncApiClient } from "./api-client";
import { initialSyncStatus, SyncEngine } from "./sync-engine";

const now = "2026-07-08T10:00:00.000Z";

function context(database: TestSqliteDatabase, ids: string[]) {
  let index = 0;
  return {
    database, deviceId: "device-1", now: () => now,
    createId: () => ids[index++] ?? (() => { throw new Error("Missing test ID"); })(),
  };
}

function client(options: {
  push?: (commands: SyncCommand[]) => Promise<SyncCommandResult[]>;
  pull?: (cursor: string | null) => Promise<PullResponse>;
}): SyncApiClient {
  return {
    push: options.push ?? (async (commands) => commands.map(({ id }) => ({
      commandId: id, status: "accepted" as const,
    }))),
    pull: options.pull ?? (async () => ({ changes: [], nextCursor: "0" })),
  };
}

describe("SyncEngine", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
    await createInitialAcademicYear(database, "2025-2026", now);
    await upsertBook(database, {
      id: "book-1", scopeId: "global", name: "Primary Math",
      educationStage: "primary", firstSemesterQuantity: 2,
      secondSemesterQuantity: 0, createdAt: now,
      updatedAt: now, deletedAt: null,
    });
  });

  afterEach(() => database.close());

  it("preserves pending commands and reports offline on transport failure", async () => {
    await addBookStock(
      { academicYear: "2025-2026", bookId: "book-1", semester: "first",
        quantity: 1, receiptNumber: "1", receiptDate: "2026-01-14" },
      context(database, ["command-1", "transaction-1", "item-1"]),
    );
    const store = createExternalStore(initialSyncStatus);
    const engine = new SyncEngine({
      database,
      client: client({ push: async () => { throw new TypeError("fetch failed"); } }),
      store,
      now: () => now,
    });

    await engine.sync();

    expect(await countOutboxRowsByStatus(database, "pending")).toBe(1);
    expect(store.getSnapshot().phase).toBe("offline");
  });

  it("marks accepted and rejected commands with visible status", async () => {
    await addBookStock(
      { academicYear: "2025-2026", bookId: "book-1", semester: "first",
        quantity: 1, receiptNumber: "2", receiptDate: "2026-01-14" },
      context(database, ["command-1", "transaction-1", "item-1"]),
    );
    const acceptedStore = createExternalStore(initialSyncStatus);
    await new SyncEngine({ database, client: client({}), store: acceptedStore, now: () => now }).sync();
    expect(await countOutboxRowsByStatus(database, "synced")).toBe(1);
    expect(acceptedStore.getSnapshot().phase).toBe("synced");

    await addBookStock(
      { academicYear: "2025-2026", bookId: "book-1", semester: "first",
        quantity: 1, receiptNumber: "3", receiptDate: "2026-01-14" },
      context(database, ["command-2", "transaction-2", "item-2"]),
    );
    const rejectedStore = createExternalStore(initialSyncStatus);
    await new SyncEngine({
      database,
      client: client({ push: async (commands) => commands.map(({ id }) => ({
        commandId: id, status: "rejected", reasonCode: "INSUFFICIENT_STOCK",
        message: "Not enough stock",
      })) }),
      store: rejectedStore,
      now: () => now,
    }).sync();
    expect(await countOutboxRowsByStatus(database, "rejected")).toBe(1);
    expect(rejectedStore.getSnapshot().phase).toBe("rejected");
  });

  it("translates a reversal target to the original command ID", async () => {
    await addBookStock(
      { academicYear: "2025-2026", bookId: "book-1", semester: "first",
        quantity: 1, receiptNumber: "4", receiptDate: "2026-01-14" },
      context(database, ["stock-command", "stock-transaction", "stock-item"]),
    );
    await reverseTransaction(
      { academicYear: "2025-2026", transactionId: "stock-transaction" },
      context(database, ["reverse-command", "reverse-transaction", "reverse-item"]),
    );
    const pushed: SyncCommand[][] = [];
    await new SyncEngine({
      database,
      client: client({ push: async (commands) => {
        pushed.push(commands);
        return commands.map(({ id }) => ({ commandId: id, status: "accepted" }));
      } }),
      store: createExternalStore(initialSyncStatus),
      now: () => now,
    }).sync();

    expect(pushed.flat().find(({ type }) => type === "REVERSE_TRANSACTION")).toEqual(
      expect.objectContaining({ transactionId: "stock-command" }),
    );
  });

  it("applies pulled student and book snapshots and advances the cursor", async () => {
    const pull = vi.fn()
      .mockResolvedValueOnce({
        nextCursor: "5",
        changes: [
          { sequence: 1, commandId: "remote-1", entityTable: "academic_years",
            entityId: "2025-2026", createdAt: now, payloadJson: JSON.stringify({
              academicYear: "2025-2026", status: "current", createdAt: now, archivedAt: null,
            }) },
          { sequence: 2, commandId: "remote-1", entityTable: "students",
            entityId: "student-1", createdAt: now, payloadJson: JSON.stringify({
              id: "student-1", scopeId: "global", name: "Remote Student",
              governmentId: "29901011234567", educationStage: "primary",
              gradeLevel: "primary1", academicYear: "2025-2026", previousStudentId: null,
              createdAt: now, updatedAt: now, deletedAt: null,
            }) },
          { sequence: 3, commandId: "remote-1", entityTable: "books",
            entityId: "book-1", createdAt: now, payloadJson: JSON.stringify({
              id: "book-1", scopeId: "global", name: "Remote Math",
              educationStage: "primary", firstSemesterQuantity: 9,
              secondSemesterQuantity: 4, createdAt: now,
              updatedAt: now, deletedAt: null,
            }) },
          { sequence: 4, commandId: "remote-1", entityTable: "inventory_transactions",
            entityId: "remote-transaction", createdAt: now, payloadJson: JSON.stringify({
              id: "remote-transaction", scopeId: "global", academicYear: "2025-2026",
              type: "student_issue", studentId: "student-1", receiptNumber: null,
              receiptDate: null, reversedTransactionId: null,
              reversedByTransactionId: null, deviceId: "remote-device",
              commandId: "remote-command", occurredAt: now, createdAt: now,
            }) },
          { sequence: 5, commandId: "remote-1", entityTable: "inventory_transaction_items",
            entityId: "remote-item", createdAt: now, payloadJson: JSON.stringify({
              id: "remote-item", transactionId: "remote-transaction", bookId: "book-1",
              semester: "first", quantityDelta: -1, quantityAfter: 9, createdAt: now,
            }) },
          { sequence: 6, commandId: "remote-1", entityTable: "student_books",
            entityId: "remote-student-book", createdAt: now, payloadJson: JSON.stringify({
              id: "remote-student-book", scopeId: "global", academicYear: "2025-2026",
              studentId: "student-1", bookId: "book-1", semester: "first",
              issuedTransactionId: "remote-transaction",
              createdAt: now, reversedAt: null,
            }) },
        ],
      })
      .mockResolvedValueOnce({ changes: [], nextCursor: "5" });
    await new SyncEngine({
      database, client: client({ pull }),
      store: createExternalStore(initialSyncStatus), now: () => now,
    }).sync();

    expect(await listAcademicYears(database)).toEqual([
      expect.objectContaining({ academicYear: "2025-2026", status: "current" }),
    ]);
    expect(await listStudents(database, "2025-2026")).toEqual([
      expect.objectContaining({ name: "Remote Student" }),
    ]);
    expect(await getBookById(database, "book-1")).toEqual(
      expect.objectContaining({ name: "Remote Math", firstSemesterQuantity: 9,
        secondSemesterQuantity: 4 }),
    );
    expect(await listInventoryTransactions(database, "2025-2026")).toEqual([
      expect.objectContaining({ commandId: "remote-command" }),
    ]);
    expect(await listInventoryTransactionItems(database, "remote-transaction")).toHaveLength(1);
    expect(await listActiveStudentBookRows(database, "2025-2026", "student-1")).toHaveLength(1);
  });
});
