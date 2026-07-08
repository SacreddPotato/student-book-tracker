export const requiredTableNames = [
  "students",
  "books",
  "student_books",
  "inventory_transactions",
  "inventory_transaction_items",
  "sync_outbox",
  "sync_state",
  "app_settings",
] as const;

export const requiredIndexNames = [
  "students_scope_government_id_unique",
  "books_scope_stage_name_unique",
] as const;

export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    name TEXT NOT NULL,
    government_id TEXT NOT NULL,
    education_stage TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS students_scope_government_id_unique
    ON students(scope_id, government_id)
    WHERE deleted_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    name TEXT NOT NULL,
    education_stage TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS books_scope_stage_name_unique
    ON books(scope_id, education_stage, name)
    WHERE deleted_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS student_books (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    student_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    issued_transaction_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    reversed_at TEXT,
    UNIQUE(scope_id, student_id, book_id, issued_transaction_id)
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_transactions (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    type TEXT NOT NULL,
    student_id TEXT,
    reversed_transaction_id TEXT,
    reversed_by_transaction_id TEXT,
    device_id TEXT,
    command_id TEXT NOT NULL UNIQUE,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_transaction_items (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    quantity_delta INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY,
    command_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    id TEXT PRIMARY KEY,
    pull_cursor TEXT,
    last_synced_at TEXT,
    last_error TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const;
