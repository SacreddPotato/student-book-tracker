import type { SqlDatabase, SqlStatement } from "./types";

const transactionTails = new WeakMap<object, Promise<void>>();

export async function runLocalTransaction<T>(
  database: SqlDatabase,
  operation: (transaction: SqlDatabase) => Promise<T>,
): Promise<T> {
  const key = database as object;
  const previous = transactionTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  transactionTails.set(key, tail);
  await previous.catch(() => undefined);

  try {
    if (database.executeTransaction) {
      const statements: SqlStatement[] = [];
      const transaction: SqlDatabase = {
        execute: async (query, values = []) => {
          statements.push({ query, values });
          return { rowsAffected: 0 };
        },
        select: (query, values) => database.select(query, values),
      };
      const result = await operation(transaction);
      await database.executeTransaction(
        database.databaseFile ?? "student-book-tracker-react.db",
        statements,
      );
      return result;
    }

    await database.execute("BEGIN");
    try {
      const result = await operation(database);
      await database.execute("COMMIT");
      return result;
    } catch (error) {
      await database.execute("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    release();
    if (transactionTails.get(key) === tail) transactionTails.delete(key);
  }
}
