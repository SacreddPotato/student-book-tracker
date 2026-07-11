import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import type { SqlDatabase, SqlValue } from "./local-db";
import { runLocalTransaction } from "./local-transaction";

class TestSqliteDatabase implements SqlDatabase {
  readonly db = new DatabaseSync(":memory:");

  async execute(sql: string, values: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(bindings(values));
  }

  async select<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(bindings(values)) as T[];
  }
}

function bindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("runLocalTransaction", () => {
  it("sends Tauri writes as one atomic Rust-side batch without raw BEGIN statements", async () => {
    const execute = vi.fn(async () => undefined);
    const executeTransaction = vi.fn(async () => undefined);
    const database: SqlDatabase = {
      execute,
      select: async () => [],
      executeTransaction,
    };

    await runLocalTransaction(database, async (transaction) => {
      await transaction.execute("INSERT INTO example (id) VALUES ($1)", ["one"]);
      await transaction.execute("UPDATE example SET id = $1", ["two"]);
    });

    expect(execute).not.toHaveBeenCalled();
    expect(executeTransaction).toHaveBeenCalledWith([
      { query: "INSERT INTO example (id) VALUES ($1)", values: ["one"] },
      { query: "UPDATE example SET id = $1", values: ["two"] },
    ]);
  });

  it("serializes competing transactions on one SQLite connection", async () => {
    const database = new TestSqliteDatabase();
    await database.execute("CREATE TABLE writes (value INTEGER NOT NULL)");
    const firstStarted = deferred();
    const allowFirstCommit = deferred();
    let secondStarted = false;

    const first = runLocalTransaction(database, async () => {
      await database.execute("INSERT INTO writes (value) VALUES (1)");
      firstStarted.resolve();
      await allowFirstCommit.promise;
    });

    await firstStarted.promise;
    const second = runLocalTransaction(database, async () => {
      secondStarted = true;
      await database.execute("INSERT INTO writes (value) VALUES (2)");
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);

    allowFirstCommit.resolve();
    await Promise.all([first, second]);

    expect(await database.select<{ value: number }>("SELECT value FROM writes ORDER BY value")).toEqual([
      { value: 1 },
      { value: 2 },
    ]);
  });
});
