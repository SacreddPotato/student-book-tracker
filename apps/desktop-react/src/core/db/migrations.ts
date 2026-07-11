import type { SqlDatabase } from "./types";
import { schemaStatements } from "./schema";

export type Migration = {
  id: string;
  statements: readonly string[];
};

export const migrations: Migration[] = [
  { id: "001_initial_local_schema", statements: schemaStatements },
  {
    id: "002_semester_inventory_academic_years",
    statements: [
      "DROP TABLE IF EXISTS student_books",
      "DROP TABLE IF EXISTS inventory_transaction_items",
      "DROP TABLE IF EXISTS inventory_transactions",
      "DROP TABLE IF EXISTS students",
      "DROP TABLE IF EXISTS books",
      "DROP TABLE IF EXISTS academic_years",
      "DROP TABLE IF EXISTS sync_outbox",
      "DROP TABLE IF EXISTS sync_state",
      "DROP TABLE IF EXISTS app_settings",
      ...schemaStatements,
    ],
  },
];

export async function runMigrations(database: SqlDatabase): Promise<void> {
  await database.execute(`CREATE TABLE IF NOT EXISTS local_schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const appliedRows = await database.select<{ id: string }>(
    "SELECT id FROM local_schema_migrations",
  );
  const appliedIds = new Set(appliedRows.map(({ id }) => id));

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue;
    await database.execute("BEGIN IMMEDIATE");
    try {
      for (const statement of migration.statements) {
        await database.execute(statement);
      }
      await database.execute(
        "INSERT INTO local_schema_migrations (id, applied_at) VALUES ($1, $2)",
        [migration.id, new Date().toISOString()],
      );
      await database.execute("COMMIT");
    } catch (error) {
      await database.execute("ROLLBACK");
      throw error;
    }
  }
}
