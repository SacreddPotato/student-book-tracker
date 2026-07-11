import { DatabaseSync } from "node:sqlite";

import type { SqlDatabase, SqlValue } from "../../src/lib/db/local-db";

export class TestSqliteDatabase implements SqlDatabase {
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

export function createIdSequence(ids: string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;
    if (!id) {
      throw new Error("Test ran out of deterministic IDs.");
    }

    return id;
  };
}

function toBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}
