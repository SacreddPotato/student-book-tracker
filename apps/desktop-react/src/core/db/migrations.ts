import type { SqlDatabase } from "./types";
import { runLocalTransaction } from "./local-transaction";
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
  {
    id: "003_grade_scoped_books",
    statements: [
      "DROP INDEX IF EXISTS books_scope_stage_name_unique",
      "DROP INDEX IF EXISTS books_scope_grade_name_unique",
      "ALTER TABLE books RENAME TO books_pre_grade_scope",
      `CREATE TABLE books (
        id TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL DEFAULT 'global',
        name TEXT NOT NULL,
        education_stage TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        first_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(first_semester_quantity >= 0),
        second_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(second_semester_quantity >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `INSERT INTO books (
        id, scope_id, name, education_stage, grade_level,
        first_semester_quantity, second_semester_quantity,
        created_at, updated_at, deleted_at
      )
      SELECT id, scope_id, name, education_stage,
        CASE education_stage
          WHEN 'kg' THEN 'kg1'
          WHEN 'primary' THEN 'primary1'
          ELSE 'preparatory1'
        END,
        first_semester_quantity, second_semester_quantity,
        created_at, updated_at, deleted_at
      FROM books_pre_grade_scope`,
      "DROP TABLE books_pre_grade_scope",
      `CREATE UNIQUE INDEX books_scope_grade_name_unique
        ON books(scope_id, grade_level, name)
        WHERE deleted_at IS NULL`,
    ],
  },
  {
    id: "004_hostless_sync_cutover",
    statements: [
      "DELETE FROM student_books",
      "DELETE FROM inventory_transaction_items",
      "DELETE FROM inventory_transactions",
      "DELETE FROM students",
      "DELETE FROM books",
      "DELETE FROM academic_years",
      "DELETE FROM sync_outbox",
      "DELETE FROM sync_state",
      `DELETE FROM app_settings
        WHERE key = 'sync.acknowledged-conflict-ids'`,
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
    await runLocalTransaction(database, async (transaction) => {
      for (const statement of migration.statements) {
        await transaction.execute(statement);
      }
      await transaction.execute(
        "INSERT INTO local_schema_migrations (id, applied_at) VALUES ($1, $2)",
        [migration.id, new Date().toISOString()],
      );
    });
  }
}
