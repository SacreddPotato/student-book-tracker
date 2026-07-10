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

## Updater And Release Notes

- The Segment 14/15 smoke test used ordered SemVer prerelease version strings published as normal GitHub releases, because the configured `releases/latest` updater endpoint ignores GitHub releases marked as prereleases.
- Future updater smoke tests must install an older updater-enabled Windows build, publish a newer signed release, then verify the installed app detects, downloads, applies, and reports the newer version.
- Keep Neon credentials, GitHub tokens, and `VITE_SYNC_API_SHARED_SECRET` out of the packaged desktop app. The updater private key remains only in the GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` secret.

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
  - `cargo check` in `apps/desktop/src-tauri` with `%USERPROFILE%\.cargo\bin` prepended to `PATH`
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

### Segment 9: Excel Export

- Status: completed on `pre-release`.
- Added `exceljs` to the desktop workspace for XLSX workbook generation.
- Added `apps/desktop/src/lib/services/excel-export.ts`.
- Student exports create a `Students` worksheet with translated left header lines, selected stage/grade center header, reserved logo area, body columns for name, selected-stage books, and student signature.
- Arabic export mode sets worksheet RTL and uses Arabic labels.
- Export rows are restricted to the selected grade group.
- Export book columns use the selected grade's education stage, so mixed-grade sheets are prevented.
- Issued books are marked in their book columns.
- The Students tab now shows an Export button and disables it while the grade group is `all`.
- The disabled export helper says `Choose a grade group before exporting.`
- The Excel service is lazy-loaded from the Export click path so the XLSX writer stays out of the initial page chunk.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/services/excel-export.test.ts`
  - `npm run test -w @app/desktop -- src/lib/ui/students/students-tab.test.ts`
  - `npm run test -w @app/desktop`
  - `npm run build -w @app/desktop`

### Segment 10: Sync API Schema And Migrations

- Status: completed on `pre-release`.
- Added Drizzle configuration for the sync API Postgres schema.
- Added Neon serverless database client plumbing in `apps/sync-api/src/db/client.ts`.
- Added `apps/sync-api/src/env.ts` with explicit guidance for where local testing and production Neon URLs belong.
- Added a remote Postgres schema equivalent to the canonical local tables:
  - `students`
  - `books`
  - `student_books`
  - `inventory_transactions`
  - `inventory_transaction_items`
  - `sync_outbox`
  - `sync_state`
  - `app_settings`
- Added remote-only `sync_changes` metadata with a monotonically increasing sequence cursor for future pull sync.
- Generated the initial Drizzle migration under `apps/sync-api/drizzle`.
- Updated `apps/sync-api/.env.example` without committing real URLs or secrets.
- Added schema/env tests proving required tables, matching column names, and env placement guidance.
- Verification completed:
  - `npm run test -w @app/sync-api`
  - `npm run typecheck -w @app/sync-api`
  - `npm run db:generate -w @app/sync-api`
  - `npm run db:migrate -w @app/sync-api` failed as expected because no Neon URL or sync secret is configured in this environment.
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
- Environment note: put the Neon dev/testing branch URL in untracked `apps/sync-api/.env` as `DATABASE_URL`; put the production Neon branch URL in GitHub environment secrets or the production hosting provider env vars as `DATABASE_URL`. Store `SYNC_API_SHARED_SECRET` beside the matching URL in the same local file or secret store.
- Live Neon migration status:
  - On 2026-07-09, the configured Neon connection in `apps/sync-api/.env` was verified with a safe `select 1` query.
  - `npm run db:migrate -w @app/sync-api` was run successfully against the configured Neon database.
  - The remote database was verified to contain all Segment 10 public tables plus Drizzle migration history.
- Ongoing migration rule: whenever the sync API Drizzle schema changes during development, generate/commit the migration and run `npm run db:migrate -w @app/sync-api` against the configured Neon dev/testing branch before considering the iteration complete.

### Frontend Redesign: Flexible Minimal Desktop Workspace

- Status: completed on `pre-release` while Segment 11 is deferred.
- Rebuilt the desktop shell as a responsive workspace with a compact dark navigation rail, persistent language toggle, and clearer active-section hierarchy.
- Replaced the rigid full-width chrome with a restrained visual system: soft workspace background, elevated control cards, grouped data surfaces, consistent input/button states, and calmer empty/error states.
- Applied the same system to Students, Books, Logs, forms, checklists, tables, status badges, and confirmation dialogs without changing local-first behavior or translation contracts.
- Verification completed:
  - `npm run test -w @app/desktop -- src/routes/page-shell.test.ts src/lib/ui/students/students-tab.test.ts src/lib/ui/books/books-tab.test.ts src/lib/ui/logs/logs-tab.test.ts`
  - `npm run typecheck -w @app/desktop`
  - `npm run build -w @app/desktop`
  - Browser preview at `http://127.0.0.1:1420` for Students, Books, and Logs layouts.
- Environment note: browser-only preview displays the tab-specific load-error placeholders because the Tauri SQLite plugin is unavailable outside the desktop shell; use `npm run tauri -w @app/desktop -- dev` for local database behavior.

### Segment 11: Sync API Command Application

- Status: completed on `pre-release`.
- Added `GET /health`, protected `POST /sync/push`, and protected `GET /sync/pull?since=<cursor>`.
- Sync transport protection uses the `x-sync-api-key` header and `SYNC_API_SHARED_SECRET`; it is a shared transport guard, not user identity or authorization.
- Added runtime validation for every shared command type and push payloads.
- Added transactional application for `UPSERT_STUDENT`, `UPSERT_BOOK`, `ADD_BOOK_STOCK`, `ISSUE_BOOKS_TO_STUDENT`, and `REVERSE_TRANSACTION`.
- Command IDs are idempotent through `sync_changes`; accepted mutations write ordered entity snapshots to `sync_changes` for cursor-based pull sync.
- Issuing locks the involved book rows in a database transaction before verifying stock; mixed-stage issues, missing records, duplicate book IDs, and insufficient stock are rejected without partial writes.
- Reversals create an inverse transaction, restore quantities, mark the original transaction and issued student-book rows as reversed, and reject a second reversal.
- Replaced the sync API's Neon HTTP database driver with the installed Postgres driver because the HTTP driver does not support Drizzle transactions. The migration command now closes its database client so it exits normally.
- Added in-memory command-application and Hono route tests covering valid shipment, issue, reversal, duplicate command behavior, insufficient-stock rejection, transport token enforcement, malformed requests, and ordered pulls.
- Verification completed:
  - `npm run test -w @app/sync-api`
  - `npm run typecheck -w @app/sync-api`
  - `npm run db:migrate -w @app/sync-api` against the configured Neon dev/testing branch
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

### Segment 12: Desktop Sync Engine

- Status: completed on `pre-release` after the Segment 11 publication checkpoint.
- Added desktop build-time sync configuration through `VITE_SYNC_API_BASE_URL` and optional `VITE_SYNC_API_SHARED_SECRET`; development defaults to `http://127.0.0.1:8787`, while production requires its deployed API URL to be injected during packaging.
- Added a fetch-based API client that sends `x-sync-api-key`, pushes commands to `/sync/push`, and pulls entity snapshots from `/sync/pull` using the last cursor.
- Added the sync engine to desktop startup and browser `online` events. It leaves the local queue pending on network failure, marks accepted/duplicate rows synced, and records rejected rows with their server reason.
- Added local `sync_state` repository helpers. The engine persists the latest pull cursor, last successful sync time, and last error.
- Applied pulled student, book, transaction, item, and student-book snapshots to local SQLite, preserving local transaction IDs where a command had already been created locally. Local reversal commands are translated to the original command ID before they are sent to the remote API.
- Student and book create/edit flows now enqueue `UPSERT_STUDENT` and `UPSERT_BOOK` commands, so the sync engine covers all shared local writes rather than inventory commands only.
- Added a compact visible sync indicator for syncing, synced, offline/error, and rejected states; rejected command counts remain visible for later Segment 13 conflict-detail work.
- Enabled the sync API CORS policy for the desktop webview and the custom `X-Sync-Api-Key` header.
- Added runtime-config and sync-engine tests for offline queue preservation, accepted result handling, rejected stock conflict preservation, reversal target translation, and pull snapshot application.
- Verification completed:
  - `npm run test -w @app/desktop`
  - `npm run typecheck -w @app/desktop`
  - `npm run build -w @app/desktop`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

### Segment 13: Conflict Visibility And Recovery

- Status: completed on `pre-release`.
- Added a dedicated `SyncConflictsPanel` that appears only for unacknowledged rejected commands.
- Insufficient-stock issue conflicts now resolve and show the affected local student name and requested book names from the persisted command payload.
- Acknowledging a conflict stores only its ID in `app_settings`; the original `sync_outbox` row remains rejected and available for audit.
- Rejected rows are still excluded from the sync engine's pending queue, so acknowledgement never retries a rejected command.
- The compact sync indicator now distinguishes the count of unacknowledged rejections and hides the rejected warning once every currently rejected command has been reviewed.
- Added component tests covering visible rejected issue context and acknowledgement without deleting the audit row.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/ui/sync/sync-conflicts.test.ts`
  - `npm run typecheck -w @app/desktop`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

### Segment 14: Desktop Updates

- Status: completed on `pre-release`.
- Added Tauri's updater plugin, updater capability, signed updater artifacts, and a GitHub Releases `latest.json` endpoint for Windows NSIS packages.
- Production desktop startup performs one availability check; local development/browser runs remain updater-disabled.
- Added Settings controls for check, available, download, ready-to-install, up-to-date, and failure states. Downloading and installation always require the user's explicit action; the app never silently downloads, installs, or restarts.
- Added an English/Arabic global `UpdateAvailableToast` mounted in the root layout. It is visible over every workspace section, can be dismissed per version, and its `View update` action navigates to Settings while preserving the unsaved-student-selection guard.
- Added mocked updater service tests, toast component tests, and app-shell navigation coverage.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/services/updater.test.ts src/lib/ui/settings/update-available-toast.test.ts`
  - `npm run test -w @app/desktop -- src/lib/ui/settings/update-available-toast.test.ts src/routes/page-shell.test.ts`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `cargo check` in `apps/desktop/src-tauri` with `%USERPROFILE%\.cargo\bin` prepended to `PATH`
- Live updater smoke verification completed:
  - Installed `0.1.0-demo.1`, then applied the signed `0.1.0-demo.2` update and confirmed Settings reported `.2`.
  - Applied the signed `.2 -> .3` update and confirmed the permanent installed binary reported `0.1.0-demo.3`.
  - With `.3` installed on the Students screen, the production updater surfaced the global `Update available` toast for `0.1.0-demo.4`; `View update` opened Settings, the explicit download reached ready-to-install, and the signed installer applied successfully.
  - The relaunched app's Settings screen and permanent installed binary both reported `0.1.0-demo.4` and the latest-version state.

### Segment 15: CI And Release Workflows

- Status: completed on `pre-release`.
- Added Windows CI on Node 24 for dependency installation, lint, typecheck, tests, and build.
- Added a Windows release workflow for `v*` tags and manual SemVer-input dispatch. It validates the source/version, builds signed NSIS updater artifacts in a draft release, verifies the installer, `.sig`, and `latest.json`, and only then publishes the release.
- Added the Windows release/updater runbook with signing-boundary guidance. `TAURI_SIGNING_PRIVATE_KEY` is the only required secret; optional sync API configuration is public build-time configuration only.
- Verification completed:
  - CI run `29086726893` for `0.1.0-demo.3`: success.
  - Release run `29086758103` for `v0.1.0-demo.3`: success; published `latest.json`, the NSIS installer, and its signature.
  - CI run `29087472451` for `0.1.0-demo.4`: success.
  - Release run `29087483060` for `v0.1.0-demo.4`: success; draft artifact verification and publish steps both passed.
  - The live `releases/latest/download/latest.json` feed resolved to `0.1.0-demo.4` with signed `windows-x86_64` and `windows-x86_64-nsis` targets.

### Segment 16: Final MVP Quality Control

- Status: completed on `pre-release`.
- Fixed the desktop SQLite capability regression that made Students and Books show load errors: the Tauri capability now grants `sql:allow-execute` and `sql:allow-select` in addition to the SQL plugin default permission.
- Serialized first-run local database initialization so concurrent layout, tab, and sync startup callers share one migration promise and a failed attempt can be retried.
- Student and Book save failures are now visible in an alert while keeping the form open; the student empty state uses the full workspace width instead of leaving an unused half-column.
- Added Playwright workflow coverage for local student/book/stock/history/outbox behavior, offline sync accepted/rejected behavior, and Arabic RTL Excel export. The workflow specs run against a Node SQLite harness because a browser-only Vite page cannot access the Tauri SQL bridge.
- Added `docs/runbooks/verification.md` with local, packaged-Windows, offline-sync, and export verification instructions.
- Verification completed:
  - `npm run test`
  - `npm run test:e2e -w @app/desktop`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `cargo check` in `apps/desktop/src-tauri` with `%USERPROFILE%\.cargo\bin` prepended to `PATH`
  - Tauri debug smoke: confirmed migrations create all local tables and the Students/Books views load through the real SQL bridge; confirmed duplicate-save failures surface visibly.
  - `npm run tauri -w @app/desktop -- build` produced the local NSIS package; local signing correctly stops without `TAURI_SIGNING_PRIVATE_KEY`, which remains exclusively in GitHub Actions secrets.
  - CI run `29090880043` for the QA change set: success.
  - CI run `29091031496` for `0.1.0-demo.5`: success.
  - Release run `29091032788` for `v0.1.0-demo.5`: success; published the signed NSIS installer, `.sig`, and `latest.json` with both Windows updater targets.

### Maintenance: Local SQLite Transaction Coordination And Reliable Sync

- Status: completed on `pre-release`.
- Diagnosed desktop `cannot start a transaction within a transaction` and `database is locked` errors as competing local `BEGIN` calls from inventory writes and sync pull application on the shared Tauri SQLite connection; this was not a Neon connectivity issue.
- Added a shared local transaction coordinator that serializes multi-step mutations, owns commit/rollback, and is used by inventory workflows, student/book saves, sync push status updates, sync-state errors, and pulled snapshot application.
- Inventory reads and validation now run inside the serialized transaction, so concurrent stock changes calculate from committed quantities rather than stale pre-transaction reads.
- Added a single coalescing desktop sync runner for startup, reconnect, and post-mutation requests. Local student/book/inventory changes now request sync immediately; unavailable sync transport leaves outbox rows pending and reports Offline, while SQLite failures remain Sync errors.
- Prevented duplicate submissions and uncaught promise failures: stock, book, student, issue, and reversal actions disable controls while saving; stock and other save failures remain visible without losing the pending dialog/form state.
- Added coverage for competing SQLite transactions, concurrent stock increases, sync-runner coalescing, and duplicate Add Stock submission.
- Verification completed:
  - `npm run test -w @app/desktop -- src/lib/db/local-transaction.test.ts src/lib/sync/sync-runner.test.ts src/lib/services/inventory-service.test.ts src/lib/ui/books/books-tab.test.ts src/lib/sync/sync-engine.test.ts`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

### React Frontend Revamp Segment 1: Parallel Workspace And Safe Profiles

- Status: completed on `pre-release`.
- Added the approved React revamp design and implementation plan under `docs/superpowers`.
- Added `apps/desktop-react` as an isolated React 19.2 + Vite 8 + Tauri 2 workspace while preserving `apps/desktop` unchanged.
- Preview development uses identifier `com.studentbooktracker.reactdev`, SQLite file `student-book-tracker-react.db`, Vite ports `1430/1431`, and no updater endpoint.
- Added a production Tauri overlay that preserves `com.studentbooktracker.app`, `student-book-tracker.db`, the existing updater public key/feed, passive NSIS behavior, and signed updater artifacts for the later cutover gate.
- Added validated runtime configuration that rejects unknown profiles, non-HTTP sync endpoints, and missing production sync API URLs.
- Added a Rust-side allowlist for the two approved SQLite filenames before executing serialized transaction statements.
- Reused the existing desktop icon assets in the parallel shell.
- Verification completed:
  - `npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts src/App.test.tsx`
  - `npm run typecheck -w @app/desktop-react`
  - `npm run build -w @app/desktop-react`
  - `cargo test --manifest-path apps/desktop-react/src-tauri/Cargo.toml accepts_only_preview_and_production_database_files`
  - `cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml`
- Environment note: first-time npm/Cargo commands can exceed short tool timeouts while producing buffered output. Check surviving processes and generated artifacts before retrying to avoid duplicate Cargo builds.

## Next Segment Starting Point

- React workspace/profile scaffolding is complete. Start React Frontend Revamp Segment 2 by porting the SQLite schema, repositories, transaction coordinator, entity saves, and inventory workflows with Node SQLite contract tests.
