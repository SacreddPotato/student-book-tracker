export const requiredTableNames = [
  "academic_years",
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
  "students_scope_year_government_id_unique",
  "books_scope_stage_name_unique",
] as const;

export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS academic_years (
    academic_year TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK(status IN ('current', 'archived')),
    created_at TEXT NOT NULL,
    archived_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS academic_years_single_current_unique
    ON academic_years(status) WHERE status = 'current'`,
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    name TEXT NOT NULL,
    government_id TEXT NOT NULL,
    education_stage TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    previous_student_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS students_scope_year_government_id_unique
    ON students(scope_id, academic_year, government_id)
    WHERE deleted_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    name TEXT NOT NULL,
    education_stage TEXT NOT NULL,
    first_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(first_semester_quantity >= 0),
    second_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(second_semester_quantity >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS books_scope_stage_name_unique
    ON books(scope_id, education_stage, name)
    WHERE deleted_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS inventory_transactions (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    academic_year TEXT NOT NULL,
    type TEXT NOT NULL,
    student_id TEXT,
    receipt_number TEXT,
    receipt_date TEXT,
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
    semester TEXT NOT NULL CHECK(semester IN ('first', 'second')),
    quantity_delta INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL CHECK(quantity_after >= 0),
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS student_books (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL DEFAULT 'global',
    academic_year TEXT NOT NULL,
    student_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    semester TEXT NOT NULL CHECK(semester IN ('first', 'second')),
    issued_transaction_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    reversed_at TEXT,
    UNIQUE(scope_id, academic_year, student_id, book_id, semester, issued_transaction_id)
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
