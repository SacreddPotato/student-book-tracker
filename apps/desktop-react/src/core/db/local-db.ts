import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

import type { RuntimeConfig } from "../../app/runtime-config";
import { runMigrations } from "./migrations";
import type { SqlDatabase } from "./types";

let loaded: Promise<SqlDatabase> | undefined;
let initialized: Promise<SqlDatabase> | undefined;

export function loadLocalDatabase(config: RuntimeConfig): Promise<SqlDatabase> {
  loaded ??= load(config);
  return loaded;
}

async function load(config: RuntimeConfig): Promise<SqlDatabase> {
  const database = (await Database.load(config.databaseUrl)) as SqlDatabase;
  database.databaseFile = config.databaseFile;
  database.executeTransaction = async (databaseFile, statements) => {
    if (statements.length) {
      await invoke("execute_local_transaction", { databaseFile, statements });
    }
  };
  return database;
}

export function initializeLocalDatabase(config: RuntimeConfig): Promise<SqlDatabase> {
  initialized ??= initialize(config);
  return initialized;
}

async function initialize(config: RuntimeConfig): Promise<SqlDatabase> {
  try {
    const database = await loadLocalDatabase(config);
    await runMigrations(database);
    return database;
  } catch (error) {
    initialized = undefined;
    throw error;
  }
}
