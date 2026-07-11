import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SqlDatabase, SqlValue } from "./local-db";

const sqlPlugin = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: sqlPlugin.load },
}));

class TestSqliteDatabase implements SqlDatabase {
  readonly db = new DatabaseSync(":memory:");

  async execute(sql: string, values: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(toBindings(values));
  }

  async select<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(toBindings(values)) as T[];
  }

  close(): void {
    this.db.close();
  }
}

function toBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}

describe("initializeLocalDatabase", () => {
  let database: TestSqliteDatabase;

  beforeEach(() => {
    vi.resetModules();
    sqlPlugin.load.mockReset();
    database = new TestSqliteDatabase();
    sqlPlugin.load.mockResolvedValue(database);
  });

  it("shares one migration run across concurrent desktop startup callers", async () => {
    const { initializeLocalDatabase } = await import("./local-db");

    const [first, second, third] = await Promise.all([
      initializeLocalDatabase(),
      initializeLocalDatabase(),
      initializeLocalDatabase(),
    ]);

    expect(first).toBe(database);
    expect(second).toBe(database);
    expect(third).toBe(database);
    expect(sqlPlugin.load).toHaveBeenCalledOnce();
    expect(
      await database.select<{ count: number }>(
        "SELECT COUNT(*) AS count FROM local_schema_migrations",
      ),
    ).toEqual([{ count: 1 }]);
  });
});
