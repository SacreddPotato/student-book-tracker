# AGENTS.md

## Segment Handoff Rule

Update this file at the end of every completed implementation segment. Keep the latest segment status, verification commands, known environment notes, and next-segment starting point current.

## Project Context

- Goal: Windows-first offline desktop app for student and book inventory tracking.
- Monorepo workspaces:
  - `apps/desktop`: Tauri 2 + SvelteKit desktop app.
  - `apps/sync-api`: Hono sync API.
  - `packages/shared`: shared TypeScript contracts and domain helpers.
- Desktop frontend uses SvelteKit static output through `@sveltejs/adapter-static` for Tauri packaging.

## Current Branch

- Segment work is happening on `pre-release`.

## Future Segment Reminders

- Segment 14 desktop updater verification must use ordered pre-release tags for updater smoke testing:
  - Build and install a previous Windows EXE/MSI version that already has updater support.
  - Tag and publish a newer pre-release version, even if it contains no functional changes beyond the version bump needed for the updater feed.
  - Launch the installed previous version, trigger/check for updates, apply the update, and verify the installed app reports the newer version.
  - Keep Neon credentials and GitHub tokens out of the packaged desktop app while testing updater metadata.

## Segment Status

### Segment 1: Workspace Skeleton

- Status: completed on `pre-release`.
- Root npm workspaces are configured for `apps/*` and `packages/*`.
- Desktop scaffold is Tauri 2 + SvelteKit with static adapter output.
- Desktop shell has primary tabs for Students, Books, and Logs.
- Sync API and shared package skeletons are present.
- Added `README.md`.
- Added a desktop Vitest contract test for the Segment 1 tab order.
- Verification completed:
  - `npm install`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run dev:desktop` with `%USERPROFILE%\.cargo\bin` prepended to PATH
- Environment note: Rust exists at `%USERPROFILE%\.cargo\bin`, but the current shell PATH may need that directory prepended before running Tauri commands.

### Segment 2: Shared Domain Package

- Status: completed on `pre-release`.
- Added shared education stage and grade-level contracts.
- Added `isGradeAllowedForStage(stage, gradeLevel)`.
- Added stage-based book/student issuance matching.
- Added Cairo date/time formatting with `Africa/Cairo`.
- Added exact sync command and sync command result TypeScript contracts.
- Added shared Vitest tests for education, inventory matching, Cairo formatting, and sync command type contracts.
- Verification completed:
  - `npm run test -w @app/shared`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

### Segment 3: i18n Foundation

- Status: completed on `pre-release`.
- Added English and Arabic dictionaries under `apps/desktop/src/lib/i18n`.
- Added dictionary keys for tabs, stages, grade levels, form labels, buttons, warnings, sync states, logs, export labels, error messages, and current shell empty states.
- Added the `language` store, `setLanguage`, `getTranslation`, and flattened `translationKeys`.
- Added a language switcher in the desktop shell.
- Replaced visible shell copy with translation keys in `apps/desktop/src/routes/+page.svelte`.
- Added a localized layout wrapper that applies `lang` and `dir` for English/Arabic.
- Added tests for dictionary key parity, required key coverage, translation lookup, and tab translation keys.
- Verification completed:
  - `npm run test -w @app/desktop`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

### Segment 4: Local SQLite Persistence

- Status: completed on `pre-release`.
- Installed and configured the Tauri SQL plugin for SQLite in the desktop app and Rust shell.
- Added local SQLite schema and migration modules for all shared tables plus `sync_outbox`, `sync_state`, and `app_settings`.
- Added repository functions for students, books, inventory transactions, transaction items, and outbox rows under `apps/desktop/src/lib/db`.
- Desktop startup now loads the local database and runs migrations from `apps/desktop/src/routes/+layout.svelte`.
- Added a `node:sqlite` in-memory Vitest harness for local schema, migration idempotency, and repository behavior.
- Verification completed:
  - `npm run test -w @app/desktop`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `cargo check` in `apps/desktop/src-tauri` with `%USERPROFILE%\.cargo\bin` prepended to PATH
  - `npm run tauri -w @app/desktop -- dev` with `%USERPROFILE%\.cargo\bin` prepended to PATH
- Environment note: local desktop SQLite data is created at `%APPDATA%\com.studentbooktracker.app\student-book-tracker.db` during Tauri dev runs.

### Segment 5: Local Inventory Transactions

- Status: completed on `pre-release`.
- Added `apps/desktop/src/lib/services/inventory-service.ts` with local-first workflows for `addBookStock`, `issueBooksToStudent`, and `reverseTransaction`.
- Stock increases now create an inventory transaction and item, update book quantity, and enqueue an `ADD_BOOK_STOCK` outbox command.
- Student issue now validates all selected books have stock before mutating, creates transaction items and `student_books` rows, decrements book quantities, and enqueues `ISSUE_BOOKS_TO_STUDENT`.
- Reversal now creates an inverse transaction, updates the original transaction reversal pointer, restores affected book quantities, marks issued student books reversed when relevant, and enqueues `REVERSE_TRANSACTION`.
- Added repository helpers for book/student lookups, transaction lookup, issued-book rows, and reversal updates.
- Added `apps/desktop/src/lib/services/inventory-service.test.ts` covering stock increase, student issue decrement, zero-stock local failure, reversal stock restore, and double-reversal failure.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/services/inventory-service.test.ts`
  - `npm run test -w @app/desktop`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

### Segment 6: Books Tab

- Status: completed on `pre-release`.
- Added `BooksTab.svelte`, `BookForm.svelte`, and `AddStockDialog.svelte` under `apps/desktop/src/lib/ui/books`.
- The Books tab lists local SQLite books, supports stage filtering, and displays zero-stock books with a translated warning label and highlighted row state.
- Added create and edit flows for book name and education stage.
- Added an Add Stock flow that calls the local `addBookStock` inventory service and refreshes the visible quantity.
- Added DOM component tests with `@testing-library/svelte`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom`.
- Configured the Svelte testing plugin in `apps/desktop/vite.config.js` so component tests use Svelte's browser runtime.
- Updated English and Arabic dictionaries with Books tab labels.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/ui/books/books-tab.test.ts`
  - `npm run test -w @app/desktop`
  - `npm run typecheck -w @app/desktop`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run tauri -w @app/desktop -- dev` with `%USERPROFILE%\.cargo\bin` prepended to PATH
- Environment note: plain Vite browser smoke can render the shell and Books tab route, but local DB behavior still requires Tauri or injected test DB because Tauri SQL is unavailable in a normal browser.

### Segment 7: Students Tab

- Status: completed on `pre-release`.
- Added `StudentsTab.svelte`, `StudentForm.svelte`, `StudentBookPanel.svelte`, and `UnsavedBookSelectionDialog.svelte` under `apps/desktop/src/lib/ui/students`.
- The Students tab lists local SQLite students and supports stage and grade grouping controls.
- Added create and edit flows for student name, government ID, education stage, and grade level.
- Student forms restrict grade-level options to the selected education stage.
- Selecting a student opens a stage-filtered book checklist.
- Book checklist selections remain draft-only until Confirm is clicked; Confirm calls `issueBooksToStudent`, persists `student_books`, decrements stock, and refreshes issued state.
- Zero-stock books are disabled and clearly marked with the translated zero-stock warning.
- Switching students or leaving the Students tab with draft selections now shows the unsaved-selection warning dialog.
- Added a `beforeunload` guard for browser/page leave while draft selections exist.
- Added DOM tests covering student create/edit/grouping, draft-only checks, confirmed issuance/decrement, and unsaved-selection warning behavior.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/ui/students/students-tab.test.ts`
  - `npm run test -w @app/desktop`
  - `npm run typecheck -w @app/desktop`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run tauri -w @app/desktop -- dev` with `%USERPROFILE%\.cargo\bin` prepended to PATH

### Frontend Cleanup: Shell Chrome, Copy, And Export Guard

- Status: completed on `pre-release` after Segment 7.
- Native Tauri window decorations are restored; the shell does not render custom window action buttons.
- Replaced the shell language dropdown with a compact EN/AR toggle.
- Removed confusing offline-only shell copy: `Offline desktop workspace` and `Offline ready`.
- Students empty state now shows only `No students yet` when no students exist; the issue-books prompt appears only after at least one student exists and no student is selected.
- Books and Students load failures now use tab-specific messages instead of the generic `Validation failed` copy.
- Updated Segment 9 export planning so printing/export is disabled unless a concrete grade group is selected.
- Segment 9 should add translated helper text: `Choose a grade group before exporting.`
- Verification completed:
  - `npm run test -w @app/desktop -- src/routes/page-shell.test.ts src/lib/ui/students/students-tab.test.ts src/lib/ui/books/books-tab.test.ts`
  - `npm run test -w @app/desktop`
  - `npm run typecheck -w @app/desktop`
  - `npm run lint`
  - `npm run build`
  - `npm run tauri -w @app/desktop -- dev` with `%USERPROFILE%\.cargo\bin` prepended to PATH

### Segment 8: Logs Tab And Reversals

- Status: completed on `pre-release`.
- Added `LogsTab.svelte`, `LogGroup.svelte`, and `ReverseTransactionDialog.svelte` under `apps/desktop/src/lib/ui/logs`.
- The Logs tab now renders inventory history from local SQLite.
- Shipment increase logs are grouped by book name and student issue logs are grouped by student name.
- Each log shows all transaction items, Cairo-formatted date/time, quantity deltas, and post-transaction quantity.
- Reversible logs expose a Reverse action with confirmation.
- Reversed originals and reversal transactions are marked as already reversed and cannot be reversed again.
- Confirming reversal calls `reverseTransaction`, refreshes logs, restores stock, and marks issued student books reversed for student issue transactions.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/ui/logs/logs-tab.test.ts`
  - `npm run test -w @app/desktop`

## Next Segment Starting Point

- Segment 9 should build the Students tab Excel export.
- Start with tests for English headers, Arabic RTL worksheet mode, disabled export while grade group is `all`, selected-grade-only rows, and selected-grade stage book columns.
