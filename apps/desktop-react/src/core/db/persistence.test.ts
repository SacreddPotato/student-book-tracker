import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestSqliteDatabase } from "./test-database";
import { runMigrations } from "./migrations";
import { requiredIndexNames, requiredTableNames } from "./schema";
import { listBooks, upsertBook } from "./repositories/books";
import { listPendingOutboxRows } from "./repositories/outbox";
import { getSettingJson, saveSettingJson } from "./repositories/settings";
import { listStudents, upsertStudent } from "./repositories/students";
import { getSyncState, saveSyncState } from "./repositories/sync-state";

const fixedNow = "2026-07-08T10:00:00.000Z";

describe("React desktop SQLite persistence", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
  });

  afterEach(() => database.close());

  it("creates every canonical local table and index idempotently", async () => {
    await runMigrations(database);

    const tables = await database.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const indexes = await database.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );

    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([...requiredTableNames]),
    );
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([...requiredIndexNames]),
    );
    expect(
      await database.select<{ count: number }>(
        "SELECT COUNT(*) AS count FROM local_schema_migrations",
      ),
    ).toEqual([{ count: 1 }]);
  });

  it("upserts students and books without losing inventory quantity", async () => {
    await upsertStudent(database, {
      id: "student-1",
      scopeId: "global",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
      createdAt: fixedNow,
      updatedAt: fixedNow,
      deletedAt: null,
    });
    await upsertBook(database, {
      id: "book-1",
      scopeId: "global",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 12,
      createdAt: fixedNow,
      updatedAt: fixedNow,
      deletedAt: null,
    });

    expect(await listStudents(database)).toEqual([
      expect.objectContaining({ id: "student-1", gradeLevel: "primary1" }),
    ]);
    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-1", quantity: 12 }),
    ]);
    expect(await listPendingOutboxRows(database)).toEqual([]);
  });

  it("persists sync cursors and JSON settings", async () => {
    await saveSyncState(database, {
      id: "global",
      pullCursor: "42",
      lastSyncedAt: fixedNow,
      lastError: null,
    });
    await saveSettingJson(database, "acknowledged", ["command-1"], fixedNow);

    expect(await getSyncState(database)).toEqual({
      id: "global",
      pullCursor: "42",
      lastSyncedAt: fixedNow,
      lastError: null,
    });
    expect(await getSettingJson<string[]>(database, "acknowledged", [])).toEqual([
      "command-1",
    ]);
  });
});
