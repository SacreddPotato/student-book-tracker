import type { SqlDatabase } from "./local-db";
import { schemaStatements } from "./schema";

export type Migration = {
  id: string;
  statements: readonly string[];
};

export const migrations: Migration[] = [
  {
    id: "001_initial_local_schema",
    statements: schemaStatements,
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
    if (appliedIds.has(migration.id)) {
      continue;
    }

    for (const statement of migration.statements) {
      await database.execute(statement);
    }

    await database.execute(
      "INSERT INTO local_schema_migrations (id, applied_at) VALUES ($1, $2)",
      [migration.id, new Date().toISOString()],
    );
  }
}
