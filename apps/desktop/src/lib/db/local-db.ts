import Database from "@tauri-apps/plugin-sql";

import { runMigrations } from "./migrations";

export type SqlValue = string | number | null | Uint8Array;

export type SqlDatabase = {
  execute(sql: string, values?: SqlValue[]): Promise<unknown>;
  select<T>(sql: string, values?: SqlValue[]): Promise<T[]>;
};

export const localDatabasePath = "sqlite:student-book-tracker.db";

let localDbPromise: Promise<SqlDatabase> | undefined;

export async function loadLocalDatabase(): Promise<SqlDatabase> {
  localDbPromise ??= Database.load(localDatabasePath) as Promise<SqlDatabase>;
  return localDbPromise;
}

export async function initializeLocalDatabase(): Promise<SqlDatabase> {
  const database = await loadLocalDatabase();
  await runMigrations(database);
  return database;
}
