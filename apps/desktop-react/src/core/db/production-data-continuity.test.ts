import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runMigrations } from "./migrations";
import { TestSqliteDatabase } from "./test-database";

const now = "2026-07-10T12:00:00.000Z";

const legacySchema = [
  `CREATE TABLE students (id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, name TEXT NOT NULL,
    government_id TEXT NOT NULL, education_stage TEXT NOT NULL, grade_level TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)`,
  `CREATE TABLE books (id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, name TEXT NOT NULL,
    education_stage TEXT NOT NULL, quantity INTEGER NOT NULL, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, deleted_at TEXT)`,
  `CREATE TABLE student_books (id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, student_id TEXT NOT NULL,
    book_id TEXT NOT NULL, issued_transaction_id TEXT NOT NULL, created_at TEXT NOT NULL, reversed_at TEXT)`,
  `CREATE TABLE inventory_transactions (id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, type TEXT NOT NULL,
    student_id TEXT, reversed_transaction_id TEXT, reversed_by_transaction_id TEXT, device_id TEXT,
    command_id TEXT NOT NULL UNIQUE, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE inventory_transaction_items (id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL,
    book_id TEXT NOT NULL, quantity_delta INTEGER NOT NULL, quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL)`,
  `CREATE TABLE sync_outbox (id TEXT PRIMARY KEY, command_type TEXT NOT NULL, payload_json TEXT NOT NULL,
    status TEXT NOT NULL, attempts INTEGER NOT NULL, last_error TEXT, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL)`,
  `CREATE TABLE sync_state (id TEXT PRIMARY KEY, pull_cursor TEXT, last_synced_at TEXT, last_error TEXT)`,
  `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
] as const;

describe("placeholder database migration", () => {
  it("clears legacy data and rebuilds the canonical semester/year schema", async () => {
    const directory = mkdtempSync(join(tmpdir(), "student-book-placeholder-migration-"));
    const path = join(directory, "student-book-tracker.db");
    let database: TestSqliteDatabase | undefined;
    try {
      database = new TestSqliteDatabase(path);
      await database.execute(`CREATE TABLE local_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`);
      for (const statement of legacySchema) await database.execute(statement);
      await database.execute(
        "INSERT INTO local_schema_migrations (id, applied_at) VALUES ($1, $2)",
        ["001_initial_local_schema", now],
      );
      await database.execute(
        `INSERT INTO students VALUES
          ('student-1', 'global', 'Placeholder', '123', 'primary', 'primary1', $1, $1, NULL)`,
        [now],
      );
      await database.execute(
        `INSERT INTO books VALUES
          ('book-1', 'global', 'Placeholder Book', 'primary', 9, $1, $1, NULL)`,
        [now],
      );
      await database.execute(
        `INSERT INTO sync_outbox VALUES
          ('command-1', 'UPSERT_BOOK', '{}', 'pending', 0, NULL, $1, $1)`,
        [now],
      );

      await runMigrations(database);

      expect(await database.select("SELECT * FROM students")).toEqual([]);
      expect(await database.select("SELECT * FROM books")).toEqual([]);
      expect(await database.select("SELECT * FROM sync_outbox")).toEqual([]);
      expect(await database.select("SELECT * FROM academic_years")).toEqual([]);
      expect(await database.select<{ name: string }>("PRAGMA table_info(books)"))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "grade_level", notnull: 1 }),
          expect.objectContaining({ name: "first_semester_quantity" }),
          expect.objectContaining({ name: "second_semester_quantity" }),
        ]));
      expect(await database.select<{ name: string }>("PRAGMA table_info(inventory_transactions)"))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "academic_year" }),
          expect.objectContaining({ name: "receipt_number" }),
          expect.objectContaining({ name: "receipt_date" }),
        ]));
      expect(await database.select<{ id: string }>("SELECT id FROM local_schema_migrations ORDER BY id"))
        .toEqual([
          { id: "001_initial_local_schema" },
          { id: "002_semester_inventory_academic_years" },
          { id: "003_grade_scoped_books" },
        ]);
    } finally {
      database?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves existing book balances and history references while assigning a grade", async () => {
    const directory = mkdtempSync(join(tmpdir(), "student-book-grade-migration-"));
    const path = join(directory, "student-book-tracker.db");
    let database: TestSqliteDatabase | undefined;
    try {
      database = new TestSqliteDatabase(path);
      await database.execute(`CREATE TABLE local_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`);
      await database.execute(`CREATE TABLE books (
        id TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL DEFAULT 'global',
        name TEXT NOT NULL,
        education_stage TEXT NOT NULL,
        first_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(first_semester_quantity >= 0),
        second_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(second_semester_quantity >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`);
      await database.execute(`CREATE UNIQUE INDEX books_scope_stage_name_unique
        ON books(scope_id, education_stage, name) WHERE deleted_at IS NULL`);
      await database.execute(`CREATE TABLE inventory_transaction_items (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        semester TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL,
        quantity_after INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`);
      await database.execute(
        "INSERT INTO local_schema_migrations (id, applied_at) VALUES ($1, $2), ($3, $2)",
        ["001_initial_local_schema", now, "002_semester_inventory_academic_years"],
      );
      await database.execute(
        `INSERT INTO books VALUES
          ('book-1', 'global', 'Primary Math', 'primary', 12, 7, $1, $1, NULL)`,
        [now],
      );
      await database.execute(
        `INSERT INTO inventory_transaction_items VALUES
          ('item-1', 'transaction-1', 'book-1', 'first', -1, 11, $1)`,
        [now],
      );

      await runMigrations(database);

      expect(await database.select("SELECT * FROM books")).toEqual([{
        id: "book-1",
        scope_id: "global",
        name: "Primary Math",
        education_stage: "primary",
        grade_level: "primary1",
        first_semester_quantity: 12,
        second_semester_quantity: 7,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }]);
      expect(await database.select<{ name: string; notnull: number }>("PRAGMA table_info(books)"))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "grade_level", notnull: 1 }),
        ]));
      expect(await database.select<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'books'",
      )).toEqual(expect.arrayContaining([{ name: "books_scope_grade_name_unique" }]));
      expect(await database.select("SELECT id, book_id FROM inventory_transaction_items"))
        .toEqual([{ id: "item-1", book_id: "book-1" }]);
    } finally {
      database?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
