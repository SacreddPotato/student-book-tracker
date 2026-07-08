# Student Book Tracker Offline-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first offline desktop app that tracks students, books, book issuance, inventory logs, reversals, Excel exports, background sync to Neon Postgres, and tag-driven desktop updates.

**Architecture:** The desktop app is local-first: reads and writes happen against local SQLite so the app works offline. A small sync API owns all writes to Neon Postgres and applies queued local commands when a connection exists. Neon is the canonical global database, but no login is required and no row is tied to a user.

**Tech Stack:** Tauri 2, SvelteKit or Svelte SPA, TypeScript, local SQLite through the Tauri SQL plugin, Hono sync API, Drizzle ORM, Neon Postgres, Vitest, Playwright, ExcelJS, GitHub Actions, Tauri updater.

---

## Product Scope

The app has three main tabs:

1. Students
2. Books
3. Logs

The app has no authentication. Anyone with the executable can open it and work immediately. The remote database schema must treat all product data as global shared data. Use a `scope_id` value of `global` for rows that need an explicit global partition. Use `device_id` only for diagnostics, audit, and sync troubleshooting, never as ownership or access control.

The app must work while offline. Local changes are queued as commands and uploaded later. Neon is the canonical global database after sync. If two offline devices make conflicting stock changes, the first valid command accepted by the sync API wins and later commands can be rejected. Rejected commands must be visible to the user.

## Revised Domain Requirements

### Education Stages And Grade Levels

Use these stage values internally:

```ts
export const educationStages = ["kg", "primary", "preparatory",] as const;
```

Display labels:

- `kg`: `KG (Kindergarten)`
- `primary`: `Primary`
- `preparatory`: `Preparatory`

The Excel export needs a grade level, so students must also have `grade_level`.

Use these grade values:

- KG: `kg1`, `kg2`
- Primary: `primary1`, `primary2`, `primary3`, `primary4`, `primary5`, `primary6`
- Preparatory: `preparatory1`, `preparatory2`, `preparatory3`

### Students

Each student has:

- name
- government ID number
- education stage
- grade level

The students table can group by education stage and grade level. Selecting a student opens a stage-filtered book checklist.

Book selections are drafts until the user confirms them. If the user checks books and tries to switch students, switch tabs, close the panel, or leave the page before confirming, show a warning. Draft selections are not persisted and do not decrement stock.

### Books

Each book has:

- name
- quantity
- education stage

Books appear in a student's checklist only when the book education stage matches the student's education stage. When a book quantity reaches `0`, the UI must display that state clearly and prevent issuing that book.

Users can add stock to a book when a shipment arrives. Adding stock creates an inventory transaction and log entry.

### Logs

Logs track every inventory transaction:

- stock increase from shipment
- stock decrease from student issue
- reversal of a previous transaction

Shipment increase logs are grouped by book name. Student issue logs are grouped under the student name and show all books taken by that student in that transaction.

Every log displays date and time in Cairo time. Store timestamps in UTC and format for display as `Africa/Cairo`.

Every reversible log has a Reverse button. Reversal must create a new inverse transaction. Never delete historical logs. A transaction can be reversed once.

### Excel Export

The Students page exports the currently grouped or filtered student view to XLSX.

Header layout:

- Left side, one line under another:
  - `Al-Gharbia`
  - `East Tanta Administrative Learning`
  - `Al-Rafii Schools`
- Center, one line under another:
  - selected education stage
  - selected grade level, such as `1st Primary`
  - `for the educational year:`
- Right side:
  - reserved logo area

Body columns:

- `name`
- one column for each relevant book in the selected stage or grade view
- `student signature`

Arabic mode must set the worksheet to RTL and use Arabic labels. English mode must use English labels.

### Internationalization

Every visible string must live in translation dictionaries for all supported languages. No hardcoded English or Arabic UI strings are allowed in components, except stable product names, technical identifiers, and values intentionally shown verbatim. The excel output from prints must support RTL modes and will be printed with the language the user selects.

### Development And Production Databases

Development builds must sync to a Neon development or testing branch. Production release builds must sync to a Neon production branch. The desktop app must not contain a Neon database password. The sync API receives Neon connection strings through environment variables.

## Recommended Repository Layout

Create a new repository using this structure:

```text
student-book-tracker/
  apps/
    desktop/
      src/
        lib/
          db/
          domain/
          i18n/
          services/
          sync/
          ui/
        routes/
      src-tauri/
      tests/
    sync-api/
      src/
        db/
        domain/
        routes/
        services/
      drizzle/
      tests/
  packages/
    shared/
      src/
        domain/
        protocol/
        time/
  docs/
    architecture/
    runbooks/
  .github/
    workflows/
```

Responsibilities:

- `apps/desktop`: Tauri desktop shell, Svelte UI, local SQLite, local domain workflows, Excel export, updater UI.
- `apps/sync-api`: public HTTP API for sync, Neon writes, Neon reads, conflict decisions, idempotency, health checks.
- `packages/shared`: shared TypeScript types, command schemas, education stage constants, Cairo time helpers, validation helpers.
- `.github/workflows`: CI, release packaging, updater metadata.

## Canonical Data Model

Use UUID text primary keys. Store timestamps as UTC ISO strings.

### Shared Tables

```sql
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL DEFAULT 'global',
  name TEXT NOT NULL,
  government_id TEXT NOT NULL,
  education_stage TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX students_scope_government_id_unique
  ON students(scope_id, government_id)
  WHERE deleted_at IS NULL;

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL DEFAULT 'global',
  name TEXT NOT NULL,
  education_stage TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX books_scope_stage_name_unique
  ON books(scope_id, education_stage, name)
  WHERE deleted_at IS NULL;

CREATE TABLE student_books (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL DEFAULT 'global',
  student_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  issued_transaction_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  UNIQUE(scope_id, student_id, book_id, issued_transaction_id)
);

CREATE TABLE inventory_transactions (
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
);

CREATE TABLE inventory_transaction_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

### Local-Only Tables

```sql
CREATE TABLE sync_outbox (
  id TEXT PRIMARY KEY,
  command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_state (
  id TEXT PRIMARY KEY,
  pull_cursor TEXT,
  last_synced_at TEXT,
  last_error TEXT
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Sync Command Protocol

All local writes that affect shared product data must become outbox commands.

```ts
export type SyncCommand =
  | AddBookStockCommand
  | IssueBooksToStudentCommand
  | ReverseTransactionCommand
  | UpsertStudentCommand
  | UpsertBookCommand;

export type AddBookStockCommand = {
  id: string;
  type: "ADD_BOOK_STOCK";
  deviceId: string;
  occurredAt: string;
  bookId: string;
  quantity: number;
};

export type IssueBooksToStudentCommand = {
  id: string;
  type: "ISSUE_BOOKS_TO_STUDENT";
  deviceId: string;
  occurredAt: string;
  studentId: string;
  bookIds: string[];
};

export type ReverseTransactionCommand = {
  id: string;
  type: "REVERSE_TRANSACTION";
  deviceId: string;
  occurredAt: string;
  transactionId: string;
};

export type UpsertStudentCommand = {
  id: string;
  type: "UPSERT_STUDENT";
  deviceId: string;
  occurredAt: string;
  student: {
    id: string;
    name: string;
    governmentId: string;
    educationStage: EducationStage;
    gradeLevel: GradeLevel;
  };
};

export type UpsertBookCommand = {
  id: string;
  type: "UPSERT_BOOK";
  deviceId: string;
  occurredAt: string;
  book: {
    id: string;
    name: string;
    educationStage: EducationStage;
  };
};
```

Server command result:

```ts
export type SyncCommandResult = {
  commandId: string;
  status: "accepted" | "rejected" | "duplicate";
  reasonCode?: "INSUFFICIENT_STOCK" | "TRANSACTION_ALREADY_REVERSED" | "UNKNOWN_STUDENT" | "UNKNOWN_BOOK" | "VALIDATION_FAILED";
  message?: string;
};
```

## Implementation Segments

### Segment 1: Workspace Skeleton

**Files:**

- Create: `package.json`
- Create: `package.json` workspaces configuration
- Create: `apps/desktop/package.json`
- Create: `apps/sync-api/package.json`
- Create: `packages/shared/package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `README.md`

- [ ] Create an npm workspaces monorepo with `apps/desktop`, `apps/sync-api`, and `packages/shared`.
- [ ] Scaffold the desktop app with Tauri 2 and Svelte TypeScript.
- [ ] Configure the desktop frontend for static output so it can be packaged in Tauri.
- [ ] Add root scripts:

```json
{
  "scripts": {
    "dev:desktop": "npm run tauri -w @app/desktop -- dev",
    "dev:api": "npm run dev -w @app/sync-api",
    "build": "npm run build --workspaces",
    "lint": "npm run lint --workspaces",
    "typecheck": "npm run typecheck --workspaces",
    "test": "npm run test --workspaces"
  }
}
```

- [ ] Add a basic desktop shell with tabs for Students, Books, and Logs.
- [ ] Run `npm install`.
- [ ] Run `npm run build`.
- [ ] Run `npm run dev:desktop` and verify the desktop app opens.
- [ ] Commit with message `chore: scaffold offline student book tracker`.

### Segment 2: Shared Domain Package

**Files:**

- Create: `packages/shared/src/domain/education.ts`
- Create: `packages/shared/src/domain/inventory.ts`
- Create: `packages/shared/src/protocol/sync-commands.ts`
- Create: `packages/shared/src/time/cairo.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/education.test.ts`
- Create: `packages/shared/tests/inventory.test.ts`
- Create: `packages/shared/tests/cairo.test.ts`

- [ ] Define `EducationStage`, `GradeLevel`, `educationStages`, and `gradeLevelsByStage`.
- [ ] Implement `isGradeAllowedForStage(stage, gradeLevel)`.
- [ ] Implement `bookCanBeIssuedToStudent(book, student)`.
- [ ] Implement `formatCairoDateTime(utcIso)`.
- [ ] Define sync command and result types exactly as listed in the Sync Command Protocol section.
- [ ] Test that each stage accepts only its allowed grades.
- [ ] Test that books only match students in the same education stage.
- [ ] Test that Cairo formatting uses `Africa/Cairo`.
- [ ] Run `npm run test -w @app/shared`.
- [ ] Commit with message `feat: add shared domain contracts`.

### Segment 3: i18n Foundation

**Files:**

- Create: `apps/desktop/src/lib/i18n/en.ts`
- Create: `apps/desktop/src/lib/i18n/ar.ts`
- Create: `apps/desktop/src/lib/i18n/index.ts`
- Create: `apps/desktop/src/lib/i18n/i18n.test.ts`
- Modify: `apps/desktop/src/routes/+layout.svelte`
- Modify: `apps/desktop/src/routes/+page.svelte`

- [ ] Add English and Arabic dictionaries.
- [ ] Include keys for tabs, stages, grade levels, form labels, buttons, warnings, sync states, logs, export labels, and error messages.
- [ ] Add a `t(key)` helper and language store.
- [ ] Add a language switcher in the app shell.
- [ ] Replace all visible shell strings with translation keys.
- [ ] Add a test that fails when dictionary key sets differ.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: add desktop translation foundation`.

### Segment 4: Local SQLite Persistence

**Files:**

- Create: `apps/desktop/src/lib/db/local-db.ts`
- Create: `apps/desktop/src/lib/db/migrations.ts`
- Create: `apps/desktop/src/lib/db/schema.ts`
- Create: `apps/desktop/src/lib/db/repositories/students.ts`
- Create: `apps/desktop/src/lib/db/repositories/books.ts`
- Create: `apps/desktop/src/lib/db/repositories/transactions.ts`
- Create: `apps/desktop/src/lib/db/repositories/outbox.ts`
- Create: `apps/desktop/src/lib/db/local-db.test.ts`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] Install and configure the Tauri SQL plugin with SQLite.
- [ ] Add local SQLite migrations for all shared and local-only tables.
- [ ] Add repository functions for students, books, transactions, and outbox rows.
- [ ] Ensure migrations run on desktop startup.
- [ ] Add a local test harness using an in-memory or temp SQLite database.
- [ ] Test that the schema creates every required table and index.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Run `npm run tauri -w @app/desktop -- dev` and verify the app starts with a local database.
- [ ] Commit with message `feat: add local sqlite persistence`.

### Segment 5: Local Inventory Transactions

**Files:**

- Create: `apps/desktop/src/lib/services/inventory-service.ts`
- Create: `apps/desktop/src/lib/services/inventory-service.test.ts`
- Modify: `apps/desktop/src/lib/db/repositories/books.ts`
- Modify: `apps/desktop/src/lib/db/repositories/transactions.ts`
- Modify: `apps/desktop/src/lib/db/repositories/outbox.ts`

- [ ] Implement `addBookStock({ bookId, quantity })`.
- [ ] Implement `issueBooksToStudent({ studentId, bookIds })`.
- [ ] Implement `reverseTransaction({ transactionId })`.
- [ ] For stock increase, create one inventory transaction, one item, update book quantity, and enqueue `ADD_BOOK_STOCK`.
- [ ] For student issue, verify every selected book has quantity greater than `0`, create one transaction, create one item per book with `quantity_delta = -1`, create `student_books` rows, decrement each book, and enqueue `ISSUE_BOOKS_TO_STUDENT`.
- [ ] For reversal, create an inverse transaction, update original transaction reversal fields, update quantities, update student book reversal fields when relevant, and enqueue `REVERSE_TRANSACTION`.
- [ ] Test stock increase.
- [ ] Test student issue decrements quantity.
- [ ] Test issuing a zero-stock book fails locally.
- [ ] Test reversal restores stock.
- [ ] Test double reversal fails.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: implement local inventory transactions`.

### Segment 6: Books Tab

**Files:**

- Create: `apps/desktop/src/lib/ui/books/BooksTab.svelte`
- Create: `apps/desktop/src/lib/ui/books/BookForm.svelte`
- Create: `apps/desktop/src/lib/ui/books/AddStockDialog.svelte`
- Create: `apps/desktop/src/lib/ui/books/books-tab.test.ts`
- Modify: `apps/desktop/src/routes/+page.svelte`
- Modify: `apps/desktop/src/lib/i18n/en.ts`
- Modify: `apps/desktop/src/lib/i18n/ar.ts`

- [ ] Build the Books tab list.
- [ ] Add create and edit flows for book name and education stage.
- [ ] Add an Add Stock flow that calls the local inventory service.
- [ ] Show zero-stock books with a clear warning style and translated label.
- [ ] Add stage filtering or grouping.
- [ ] Test that adding stock updates the visible quantity.
- [ ] Test that zero stock is displayed clearly.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Run `npm run typecheck -w @app/desktop`.
- [ ] Commit with message `feat: build books inventory tab`.

### Segment 7: Students Tab

**Files:**

- Create: `apps/desktop/src/lib/ui/students/StudentsTab.svelte`
- Create: `apps/desktop/src/lib/ui/students/StudentForm.svelte`
- Create: `apps/desktop/src/lib/ui/students/StudentBookPanel.svelte`
- Create: `apps/desktop/src/lib/ui/students/UnsavedBookSelectionDialog.svelte`
- Create: `apps/desktop/src/lib/ui/students/students-tab.test.ts`
- Modify: `apps/desktop/src/routes/+page.svelte`
- Modify: `apps/desktop/src/lib/i18n/en.ts`
- Modify: `apps/desktop/src/lib/i18n/ar.ts`

- [ ] Build the Students tab table.
- [ ] Add create and edit flows for student name, government ID, education stage, and grade level.
- [ ] Restrict grade level options based on selected education stage.
- [ ] Add grouping controls for stage and grade level.
- [ ] Build the selected student book checklist.
- [ ] Filter checklist books by the selected student's education stage.
- [ ] Keep checklist selections in draft state until Confirm is clicked.
- [ ] On Confirm, call `issueBooksToStudent`.
- [ ] Warn before switching students or leaving the tab when draft selections exist.
- [ ] Disable or clearly mark zero-stock books.
- [ ] Test that draft checks do not persist before Confirm.
- [ ] Test that Confirm persists issued books and decrements quantities.
- [ ] Test that switching students with draft checks displays a warning.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: build student book issuance flow`.

### Segment 8: Logs Tab And Reversals

**Files:**

- Create: `apps/desktop/src/lib/ui/logs/LogsTab.svelte`
- Create: `apps/desktop/src/lib/ui/logs/LogGroup.svelte`
- Create: `apps/desktop/src/lib/ui/logs/ReverseTransactionDialog.svelte`
- Create: `apps/desktop/src/lib/ui/logs/logs-tab.test.ts`
- Modify: `apps/desktop/src/routes/+page.svelte`
- Modify: `apps/desktop/src/lib/i18n/en.ts`
- Modify: `apps/desktop/src/lib/i18n/ar.ts`

- [ ] Display shipment increase logs grouped by book.
- [ ] Display student issue logs grouped by student.
- [ ] Show all transaction items under each log.
- [ ] Display Cairo date/time for every transaction.
- [ ] Add Reverse button for reversible transactions.
- [ ] Hide or disable Reverse for already reversed transactions.
- [ ] Call `reverseTransaction` after confirmation.
- [ ] Test Cairo date/time appears in logs.
- [ ] Test shipment reversal updates stock.
- [ ] Test student issue reversal restores stock and marks issued books reversed.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: add inventory logs and reversals`.

### Segment 9: Excel Export

**Files:**

- Create: `apps/desktop/src/lib/services/excel-export.ts`
- Create: `apps/desktop/src/lib/services/excel-export.test.ts`
- Modify: `apps/desktop/src/lib/ui/students/StudentsTab.svelte`
- Modify: `apps/desktop/src/lib/i18n/en.ts`
- Modify: `apps/desktop/src/lib/i18n/ar.ts`

- [ ] Install ExcelJS or an equivalent XLSX writer.
- [ ] Implement `exportStudentsWorkbook({ students, books, selectedStage, selectedGradeLevel, language })`.
- [ ] Create the left header lines exactly as specified.
- [ ] Create the center header with selected stage, selected grade level, and educational year line.
- [ ] Reserve the right header area for a logo.
- [ ] Create body columns for name, relevant books, and student signature.
- [ ] Mark issued books in their book columns.
- [ ] Enable RTL worksheet direction for Arabic.
- [ ] Add Export button to the Students tab.
- [ ] Test English header values.
- [ ] Test Arabic RTL workbook setting.
- [ ] Test body columns match relevant books.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: add student excel export`.

### Segment 10: Sync API Schema And Migrations

**Files:**

- Create: `apps/sync-api/src/db/client.ts`
- Create: `apps/sync-api/src/db/schema.ts`
- Create: `apps/sync-api/drizzle.config.ts`
- Create: `apps/sync-api/src/env.ts`
- Create: `apps/sync-api/tests/schema.test.ts`
- Create: `apps/sync-api/.env.example`

- [ ] Configure Drizzle for Neon Postgres.
- [ ] Add Postgres schema equivalent to the canonical shared tables.
- [ ] Add remote-only sync metadata if needed, such as a monotonically increasing change cursor.
- [ ] Add environment variables:

```text
DATABASE_URL=
SYNC_API_SHARED_SECRET=
NODE_ENV=development
```

- [ ] Ensure development uses the Neon dev or testing branch connection string.
- [ ] Ensure production deploys use the Neon production branch connection string.
- [ ] Do not commit real database URLs or secrets.
- [ ] Run Drizzle migrations against a safe dev database.
- [ ] Test that required tables exist.
- [ ] Commit with message `feat: add neon sync api schema`.

### Segment 11: Sync API Command Application

**Files:**

- Create: `apps/sync-api/src/routes/sync.ts`
- Create: `apps/sync-api/src/routes/health.ts`
- Create: `apps/sync-api/src/services/apply-command.ts`
- Create: `apps/sync-api/src/services/pull-changes.ts`
- Create: `apps/sync-api/src/index.ts`
- Create: `apps/sync-api/tests/apply-command.test.ts`
- Create: `apps/sync-api/tests/sync-routes.test.ts`

- [ ] Add `GET /health`.
- [ ] Add `POST /sync/push`.
- [ ] Add `GET /sync/pull?since=<cursor>`.
- [ ] Require a shared sync API token header for transport protection if the app is not public. This token is not a user identity.
- [ ] Make command IDs idempotent.
- [ ] Apply each command inside a database transaction.
- [ ] Reject `ISSUE_BOOKS_TO_STUDENT` if any selected book has insufficient stock.
- [ ] Reject reversal if the target transaction is already reversed.
- [ ] Return `SyncCommandResult[]` for pushed commands.
- [ ] Test duplicate command handling.
- [ ] Test stock conflict rejection.
- [ ] Test valid shipment increase.
- [ ] Test valid student issue.
- [ ] Test valid reversal.
- [ ] Run `npm run test -w @app/sync-api`.
- [ ] Commit with message `feat: implement sync api command application`.

### Segment 12: Desktop Sync Engine

**Files:**

- Create: `apps/desktop/src/lib/sync/api-client.ts`
- Create: `apps/desktop/src/lib/sync/sync-engine.ts`
- Create: `apps/desktop/src/lib/sync/sync-status.ts`
- Create: `apps/desktop/src/lib/sync/sync-engine.test.ts`
- Create: `apps/desktop/src/lib/ui/sync/SyncStatus.svelte`
- Modify: `apps/desktop/src/routes/+layout.svelte`
- Modify: `apps/desktop/src/lib/i18n/en.ts`
- Modify: `apps/desktop/src/lib/i18n/ar.ts`

- [ ] Add desktop runtime config for sync API base URL and optional transport token.
- [ ] Point dev builds at the dev sync API.
- [ ] Point production builds at the production sync API.
- [ ] Implement push of pending outbox commands.
- [ ] Mark accepted and duplicate commands as synced.
- [ ] Mark rejected commands as rejected and preserve the rejection reason.
- [ ] Pull remote changes after successful push.
- [ ] Apply pulled changes to local SQLite.
- [ ] Store the last pull cursor.
- [ ] Add a visible sync status indicator.
- [ ] Add a rejected command list or warning state.
- [ ] Test offline queue preservation.
- [ ] Test accepted command status.
- [ ] Test rejected stock conflict status.
- [ ] Test pulled remote change application.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: add offline sync engine`.

### Segment 13: Conflict Visibility And Recovery

**Files:**

- Create: `apps/desktop/src/lib/ui/sync/SyncConflictsPanel.svelte`
- Create: `apps/desktop/src/lib/ui/sync/sync-conflicts.test.ts`
- Modify: `apps/desktop/src/lib/sync/sync-status.ts`
- Modify: `apps/desktop/src/lib/i18n/en.ts`
- Modify: `apps/desktop/src/lib/i18n/ar.ts`

- [ ] Show rejected sync commands in a dedicated panel.
- [ ] For `INSUFFICIENT_STOCK`, show the student name and book names involved.
- [ ] Provide an acknowledge action that hides the warning after the user reviews it.
- [ ] Do not automatically retry rejected commands.
- [ ] Keep rejected command rows for audit.
- [ ] Test that rejected issue commands are visible.
- [ ] Test that acknowledging a conflict does not delete the command.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: show sync conflicts to users`.

### Segment 14: Desktop Updates

**Files:**

- Create: `apps/desktop/src/lib/services/updater.ts`
- Create: `apps/desktop/src/lib/ui/settings/SettingsTab.svelte`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src/lib/i18n/en.ts`
- Modify: `apps/desktop/src/lib/i18n/ar.ts`

- [ ] Add Tauri updater plugin.
- [ ] Disable updater checks in local development by default.
- [ ] Check for updates once on app startup in production.
- [ ] Add manual Check for Updates action in Settings.
- [ ] Show update available, downloading, ready to install, no update, and update failed states.
- [ ] Do not silently restart while the user is working.
- [ ] Test updater service state transitions with mocked updater APIs.
- [ ] Run `npm run test -w @app/desktop`.
- [ ] Commit with message `feat: add desktop update flow`.

### Segment 15: CI And Release Workflows

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release-windows.yml`
- Create: `docs/runbooks/release.md`
- Modify: `README.md`

- [ ] Add CI workflow that runs install, lint, typecheck, tests, and build.
- [ ] Ensure CI is check-only and does not auto-format or auto-commit.
- [ ] Add a manual release workflow that accepts a SemVer version input.
- [ ] Make the release workflow create a `v*` tag only after CI-style checks pass.
- [ ] Build the Windows Tauri installer on `v*` tags.
- [ ] Upload installer and updater metadata to GitHub Releases.
- [ ] Verify the release contains the Windows installer and updater metadata before publishing.
- [ ] Document release commands and required GitHub secrets.
- [ ] Ensure no Neon database password is packaged into the desktop app.
- [ ] Commit with message `ci: add windows release and updater workflow`.

### Segment 16: End-To-End Verification

**Files:**

- Create: `apps/desktop/tests/e2e/student-book-flow.spec.ts`
- Create: `apps/desktop/tests/e2e/offline-sync-flow.spec.ts`
- Create: `apps/desktop/tests/e2e/excel-export.spec.ts`
- Create: `docs/runbooks/verification.md`

- [ ] Add Playwright test for adding a book, adding stock, adding a student, issuing a book, and viewing the log.
- [ ] Add Playwright test for draft book checks and unsaved warning.
- [ ] Add Playwright test for Excel export generation.
- [ ] Add integration test for offline queue, reconnect, accepted sync, and rejected stock conflict.
- [ ] Run all tests with `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run a packaged Windows smoke test.
- [ ] Document the verification commands and expected results.
- [ ] Commit with message `test: add end-to-end verification`.

## Security And Secrets Rules

- Do not bundle Neon database URLs into the desktop app.
- Do not bundle GitHub tokens into the desktop app.
- If using a shared sync API token for transport protection, treat it as a guard only, not identity or authorization.
- The sync API must own all Neon writes.
- The desktop app can store local SQLite data on the user's machine.
- Do not log secret values. Log only whether required env vars are set or unset.

## Manual QA Checklist

- [ ] App opens with no internet connection.
- [ ] User can create students offline.
- [ ] User can create books offline.
- [ ] User can add stock offline.
- [ ] User can issue books offline.
- [ ] Draft book selections are not persisted before confirmation.
- [ ] Switching students with drafts shows a warning.
- [ ] Zero-stock books are clearly shown and cannot be issued.
- [ ] Logs show shipment increases.
- [ ] Logs show student issues grouped by student.
- [ ] Logs show Cairo date/time.
- [ ] Reversing shipment logs updates stock.
- [ ] Reversing student issue logs restores stock.
- [ ] Reversed logs cannot be reversed twice.
- [ ] Excel export has the required header layout.
- [ ] Excel export body has name, book columns, and student signature.
- [ ] Arabic export uses RTL worksheet formatting.
- [ ] Offline commands sync after reconnecting.
- [ ] Conflicting offline stock issue is rejected and visible.
- [ ] Dev build syncs to the Neon dev or testing branch.
- [ ] Production build syncs to the Neon production branch.
- [ ] Updater is disabled in local development.
- [ ] Production manual update check works against a test release.

## Suggested Build Order For The Receiving LLM

Follow the segments in order. Do not build UI features before the shared domain contracts, i18n foundation, and local SQLite service exist. Do not build sync before local inventory transactions are well tested. Do not build releases before app build and sync behavior are stable.

The safest checkpoint rhythm is:

1. Finish one segment.
2. Run the segment's tests.
3. Run typecheck.
4. Commit.
5. Ask for review if the segment changes architecture or data flow.

## Completion Definition

The project is complete when the desktop app can be installed on Windows, used fully offline, synced later to Neon through the sync API, exported to Excel in English and Arabic, reversed through immutable inventory logs, and updated through GitHub release metadata without requiring user authentication.
