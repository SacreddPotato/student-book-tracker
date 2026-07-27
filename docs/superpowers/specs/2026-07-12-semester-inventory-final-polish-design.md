# Semester Inventory, Academic Years, And Automated Releases Design

## Status And Scope

This is the final product-polish segment for the React/Tauri desktop app and Hono/Neon sync service. It adds two independently stocked semesters to every subject, stock-receipt metadata, semester-aware student issuance and reversal, academic-year setup and rollover, production and development database migrations, automated release tagging, and current operator documentation.

The preserved Svelte workspace remains a rollback source. New product behavior is implemented in `apps/desktop-react`, `apps/sync-api`, and `packages/shared` only unless a release or compatibility contract explicitly requires otherwise.

## Decisions

- A book record represents a subject. Subjects are not duplicated per semester.
- Every subject has exactly two fixed inventory balances: first semester and second semester.
- Existing application data is placeholder data and may be cleared by the migration. No legacy inventory, issuance, outbox, log, or sync-change compatibility layer is required.
- Receipt number is text so leading zeros are preserved. Receipt date is an ISO calendar date in `YYYY-MM-DD` form.
- Receipt data belongs to the stock-increase transaction because one Add Stock operation targets one subject semester.
- Student, issuance, and log records are scoped to an academic year. Books and both semester balances are global across academic years.
- Archived academic years remain selectable and read-only.
- Advancing a year promotes eligible students into new yearly snapshot rows. Preparatory 3 students receive no next-year row and are therefore voided/graduated while remaining visible in the archived year.
- Automated release tagging applies to successful non-bot pushes to `pre-release` and produces ordered normal GitHub releases using `0.1.0-demo.N` SemVer strings.

## Shared Domain Contracts

Add a shared `BookSemester` type with values `first` and `second`.

Add academic-year helpers that accept strings made of two consecutive four-digit years, such as `2025-2026`, return the exact successor, and reject skipped, reversed, or malformed ranges.

Add a grade-promotion helper with this complete chain:

`kg1 -> kg2 -> primary1 -> primary2 -> primary3 -> primary4 -> primary5 -> primary6 -> preparatory1 -> preparatory2 -> preparatory3 -> null`

The education stage is derived from the promoted grade. A null successor means the student is voided from the next active year without changing the archived snapshot.

## Database Model

### Books And Semester Inventory

Replace the active `BookRow.quantity` contract with:

- `firstSemesterQuantity: number`
- `secondSemesterQuantity: number`

Add `semester: BookSemester` to every inventory transaction item and student-book issuance. The student-book uniqueness key includes academic year and semester so a student may receive both semesters of the same subject in one transaction without ambiguity.

### Transactions And Receipts

Add these fields to inventory transactions:

- `academicYear: string`
- `receiptNumber: string | null`
- `receiptDate: string | null`

Stock-increase transactions require both receipt fields. Student-issue and reversal transactions store null. A reversal refers to the original transaction and carries inverse semester-aware items; the receipt remains visible on the original stock transaction.

### Academic Years And Student Snapshots

Add an `academic_years` table with:

- `academicYear` primary key
- `status` equal to `current` or `archived`
- `createdAt`
- nullable `archivedAt`

Exactly one year is current after setup.

Each student row is a yearly enrollment snapshot. Add `academicYear` and nullable `previousStudentId`. Change government-ID uniqueness to scope plus academic year. Rollover creates a new row with a new ID, copied name and government ID, the succeeding grade and stage, and a link to the prior-year row. Archived rows are never updated by later-year edits.

Student-book rows carry semester and academic year. Inventory transactions carry academic year, and their items inherit it through the transaction. A new year's queries therefore return no issuances or logs even though the archived rows remain stored and viewable.

## Schema Migrations

### Local SQLite

The canonical new-database schema creates the academic-year table, two book quantity columns, yearly student snapshots, semester/year-aware issuance constraints, semester transaction items, and receipt/year transaction fields.

Migration `002_semester_inventory_academic_years` treats all existing application data as disposable placeholder data. Inside serialized migration execution it:

1. Clears students, books, issuances, transactions, transaction items, outbox rows, sync state, settings, and acknowledgement data.
2. Rebuilds tables whose required fields or unique constraints changed.
3. Creates `academic_years` and the new indexes and checks.
4. Leaves the app with no current year so the first-run setup dialog is mandatory.

Fresh and upgraded databases finish with the same active schema. No old `quantity`, `bookIds`, or sync payload fallback remains in application code.

### Neon Postgres

The Drizzle schema mirrors the canonical local model. Its generated migration clears placeholder application rows and `sync_changes`, resets sync cursors, adds the academic-year structure, replaces the single quantity with two balances, and adds semester/year/receipt fields and constraints. Drizzle migration history remains intact.

No credentials or connection strings are embedded in migration files. The production and development Neon branches are migrated separately through the untracked `apps/sync-api/.env` checkpoint defined below.

## Sync Protocol And Server Behavior

`ADD_BOOK_STOCK` includes `academicYear`, `semester`, `receiptNumber`, and `receiptDate`.

`ISSUE_BOOKS_TO_STUDENT` includes `academicYear` and replaces `bookIds` with `bookSelections`, an array of `{ bookId, semester }`. Duplicate pairs are rejected while first and second semester of one subject are valid together.

Student upserts include their academic year and previous-student link. Book upserts remain year-independent and preserve both balances.

Add two commands:

- `INITIALIZE_ACADEMIC_YEAR` creates the first current year.
- `ADVANCE_ACADEMIC_YEAR` contains `fromYear`, `toYear`, and explicit promoted student snapshots with prior-row links.

The server locks the current-year state, validates the exact successor and every promotion, archives the previous year, inserts the new year and promoted students, and rejects stale or concurrent rollover attempts. It creates no new-year issuance or transaction rows and never mutates book balances during rollover.

Stock updates lock the subject row and mutate only the selected semester. Issuance locks every distinct subject row, validates the selected year's editability, education-stage match, and selected-semester stock, then decrements the exact balances atomically. Reversal is allowed only in the current year and uses each original item's semester.

Book, student, academic-year, transaction, transaction-item, and student-book snapshots include their new fields. Pulling academic-year changes updates the current-year store and archive list. Conflict messages resolve subject names and localized semester labels.

## React Desktop Behavior

### First-Run Academic-Year Setup

After database initialization, the app displays a blocking setup dialog if no current academic year exists. The user enters a valid consecutive year such as `2025-2026`. Successful setup creates the year locally, enqueues initialization, and opens the workspace.

### Academic-Year Browsing And Rollover

Students and Logs expose an academic-year selector. The current year is editable. Selecting an archived year shows a persistent read-only banner, disables student creation/editing, issuance, reversal, and other year-scoped mutations, and preserves read-only Excel export.

Books remain a global inventory and do not change when a student/log archive is selected. Book stock operations always belong to the current academic year's log.

Settings shows the current year and its exact successor. Rollover requires a synchronized, conflict-free state and a confirmation modal that summarizes promotion, voiding, issuance reset, log reset, and unchanged book stock. The destructive action stays disabled until the user types the exact target year, for example `2026-2027`.

The local rollover transaction archives the old year, creates promoted student snapshots for every grade except Preparatory 3, creates no target-year issuance or transaction rows, enqueues the advancement command, switches the view to the new current year, and requests sync.

### Books Workspace

Each subject remains one table row. It presents first- and second-semester sections with independent quantity, stock status, and labelled Add Stock action. Editing a subject changes only its name and education stage and preserves both balances.

The Add Stock dialog opens for a specific subject and semester. It displays the selected semester and requires positive quantity, nonblank receipt number, and valid receipt date. Submission is locked while saving, validation remains visible, and failure keeps all values.

### Student Issuance

The issuance checklist becomes an accessible disclosure list. Each subject header is a button with `aria-expanded` and a chevron. Expanding it reveals two semester rows. Each semester row has independent checkbox, available quantity, issued, disabled, and draft state.

Draft selections use a stable composite subject-and-semester key. A student may receive one or both semesters in one atomic transaction. The existing unsaved-selection navigation guard applies to every semester selection.

### Logs, Conflicts, And Excel

Every transaction item is labelled with subject and semester. Stock-increase logs show receipt number and receipt date. Reversal logs retain linkage and semester-aware quantity-after values.

Conflict detail labels every requested subject semester.

Excel retains one column per subject. Each student cell contains exactly one of these Numerical values; depending on how many books the student was issued:

- `0`
- `1`
- `2`

The cell is blank when neither semester was issued. Arabic exports use localized equivalents with the same four-state meaning. Exports always use the selected academic year; archived exports are allowed but immutable.

English and Arabic dictionaries retain exact key parity. Arabic remains the startup language and all academic-year, disclosure, semester, receipt, log, export, confirmation, and validation copy is localized.

## Release Automation

CI continues to validate pushes and pull requests. After validation succeeds on a non-bot `pre-release` push, a serialized tagging job:

1. Fetches the current `pre-release` tip and `v0.1.0-demo.*` tags.
2. Calculates the next unused demo sequence.
3. Updates `apps/desktop-react/package.json` and the root lockfile without asking a developer to bump the version.
4. Commits with the GitHub Actions bot identity and a CI-skip marker.
5. Creates and pushes an annotated `v<version>` tag.

Bot commits are excluded from tagging, preventing recursion. The tag-triggered Windows release workflow retains its quality gates, production overlay, signing boundary, artifact verification, and normal-release publication required by the updater's `releases/latest` endpoint. Manual dispatch remains an emergency fallback.

## Migration Execution Checkpoint

Implementation proceeds in this order:

1. Create shared contracts, schemas, migrations, academic-year commands, React behavior, release workflow, and documentation changes.
2. Rehearse local SQLite and Postgres migration SQL against disposable databases and run focused pre-migration checks.
3. Confirm the untracked `apps/sync-api/.env` is configured and run the generated migration against the user-designated Neon production branch without printing credentials.
4. Inspect migration history and required tables, columns, and constraints on that connection.
5. Pause the goal and ask the user to replace `.env` with the Neon development-branch URL.
6. After the user continues, migrate the development branch and run the complete unit, integration, rendered browser, build, Rust, and native smoke suites.

Production is never inferred from a hostname label. The user controls which Neon branch is in `.env`; README explains how to copy the branch-specific connection string, switch safely, verify the selected endpoint, and keep credentials untracked.

## Error Handling And Invariants

- Semester is always `first` or `second`.
- Academic years contain consecutive four-digit years; rollover advances exactly one year.
- Exactly one academic year is current after setup.
- Archived student, issuance, and log snapshots are read-only.
- Rollover requires a synchronized conflict-free state and exact typed target year.
- Quantity is a positive integer for stock additions and exactly one unit per semester issuance selection.
- Receipt number is trimmed and nonempty; receipt date is a real ISO calendar date.
- Missing subjects, wrong stages, duplicate selections, insufficient selected-semester stock, archived-year mutation, and double reversal fail before partial mutation.
- Rollover validates every promotion, creates no successor for Preparatory 3, copies no issuance or log rows, and never mutates book balances.
- Sync remains idempotent by command ID and rejects stale concurrent rollovers.
- Local and remote multi-record changes remain transactional.
- Rejected commands remain auditable after acknowledgement.
- Secrets, Neon URLs, and updater signing material are never committed or printed.

## Verification Contract

Focused tests cover destructive placeholder migration, academic-year parsing/setup, every grade-promotion boundary, Preparatory 3 voiding, typed rollover confirmation, archived read-only behavior, empty new-year issuance/log state, unchanged book balances, semester stock and receipt metadata, mixed-semester issuance, selected-semester insufficient stock, reversal, sync idempotency, stale rollover rejection, conflicts, four-state Excel output, disclosure behavior, and form validation.

Final verification after the development-branch switch includes:

- Shared, React, sync API, and legacy workspace tests.
- React rendered Playwright workflows in English and Arabic RTL.
- Type checking, linting, workspace builds, and React production build.
- Cargo check for the React Tauri shell.
- Local SQLite migration of a copied placeholder database and first-year setup.
- Neon development migration and schema inspection.
- Real Tauri smoke for setup, rollover, archived browsing, semester stock, issuance, reversal, sync, receipts, and Excel.
- Static workflow tests proving CI creates one ordered tag for an eligible push and excludes bot and pull-request events.

## Documentation And Handoff

README documents current product capabilities, academic-year behavior, workspace layout, local development commands, environment variables, and safe Neon production/development branch switching. The release runbook documents automatic tagging and manual fallback.

`AGENTS.md` is rewritten as a concise current-state handoff: architecture, database and migration rules, academic-year semantics, release/updater boundaries, latest verification evidence, environment notes, and next starting point. Completed historical narration that no longer guides current work is removed.
