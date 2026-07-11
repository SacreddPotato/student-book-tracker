import { DatabaseSync } from "node:sqlite";

import type { SqlDatabase, SqlValue } from "./types";

export class TestSqliteDatabase implements SqlDatabase {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
  }

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

export function createTestDatabase(): TestSqliteDatabase {
  return new TestSqliteDatabase();
}

function toSqliteBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(
    values.map((value, index) => [`$${index + 1}`, value]),
  );
}
