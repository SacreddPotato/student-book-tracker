import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

import { runMigrations } from "./migrations";

export type SqlValue = string | number | null | Uint8Array;

export type SqlStatement = {
  query: string;
  values: SqlValue[];
};

export type SqlDatabase = {
  execute(sql: string, values?: SqlValue[]): Promise<unknown>;
  select<T>(sql: string, values?: SqlValue[]): Promise<T[]>;
  executeTransaction?(statements: SqlStatement[]): Promise<void>;
};

export const localDatabasePath = "sqlite:student-book-tracker.db";

let localDbPromise: Promise<SqlDatabase> | undefined;
let initializedLocalDbPromise: Promise<SqlDatabase> | undefined;

export async function loadLocalDatabase(): Promise<SqlDatabase> {
  localDbPromise ??= loadTauriLocalDatabase();
  return localDbPromise;
}

async function loadTauriLocalDatabase(): Promise<SqlDatabase> {
  const database = (await Database.load(localDatabasePath)) as SqlDatabase;
  database.executeTransaction = async (statements) => {
    if (statements.length > 0) {
      await invoke("execute_local_transaction", { statements });
    }
  };
  return database;
}

export async function initializeLocalDatabase(): Promise<SqlDatabase> {
  initializedLocalDbPromise ??= initializeDatabase();
  return initializedLocalDbPromise;
}

async function initializeDatabase(): Promise<SqlDatabase> {
  try {
    const database = await loadLocalDatabase();
    await runMigrations(database);
    return database;
  } catch (error) {
    initializedLocalDbPromise = undefined;
    throw error;
  }
}
