# Track A Task 1 Report

## Status

DONE

## RED evidence

1. `npm run test -w @app/shared`
   - Failed with `TS2353` because `StageScopedBook` did not accept `gradeLevel`.
   - Failed with `TS2305` / `TS2724` because `DeleteBookCommand` and `DeleteStudentCommand` were not exported.
   - Failed with `TS2339` because `UpsertBookCommand.book` had no `gradeLevel`.
2. `npm run test -w @app/desktop-react -- --run src/core/db/production-data-continuity.test.ts`
   - The first run exposed a test-harness cleanup issue: failed assertions left SQLite open and Windows reported `EPERM` during temporary-directory removal. Only the test cleanup was corrected, then RED was rerun.
   - The valid RED rerun failed both tests because `books.grade_level` and migration `003_grade_scoped_books` did not exist; the preservation test showed the migrated row lacked `grade_level`.
3. `npm run test -w @app/sync-api -- --run tests/schema.test.ts`
   - Failed with `ENOENT` for missing `drizzle/0003_grade_scoped_books.sql`.
   - Failed because `books.gradeLevel` was undefined in the Drizzle schema.

All failures matched missing Task 1 behavior before production edits.

## Changed files and key decisions

- Shared contracts and tests:
  - `packages/shared/src/domain/inventory.ts`
  - `packages/shared/src/protocol/sync-commands.ts`
  - `packages/shared/tests/inventory.test.ts`
  - `packages/shared/tests/sync-commands.test.ts`
  - Replaced stage-only book/student eligibility types with required grade-scoped types, required both stage and grade equality, required `UpsertBookCommand.book.gradeLevel`, and added both delete command variants to `SyncCommand`.
- SQLite schema, migration, repository, and continuity coverage:
  - `apps/desktop-react/src/core/db/schema.ts`
  - `apps/desktop-react/src/core/db/migrations.ts`
  - `apps/desktop-react/src/core/db/repositories/books.ts`
  - `apps/desktop-react/src/core/db/production-data-continuity.test.ts`
  - `apps/desktop-react/src/core/db/persistence.test.ts`
  - Fresh databases use `grade_level TEXT NOT NULL` and `books_scope_grade_name_unique` on `(scope_id, grade_level, name)` for active rows.
  - Per the preflight override, migration `003_grade_scoped_books` rebuilds `books` rather than leaving an ALTER-added nullable column. It preserves IDs, scope, names, stages, both balances, timestamps, and tombstones; deterministic grades are `kg1`, `primary1`, and `preparatory1`. Inventory references remain unchanged string IDs.
- Postgres/Drizzle schema and migration:
  - `apps/sync-api/src/db/schema.ts`
  - `apps/sync-api/drizzle/0003_grade_scoped_books.sql`
  - `apps/sync-api/drizzle/meta/_journal.json`
  - `apps/sync-api/drizzle/meta/0003_snapshot.json`
  - `apps/sync-api/tests/schema.test.ts`
  - Migration adds the nullable column, populates deterministic grades, sets `NOT NULL`, then replaces the old partial unique index. Drizzle generated the matching journal/snapshot and a second generation reported no schema diff.
- Required grade propagation and compatibility fixtures:
  - `apps/desktop-react/src/core/services/entity-service.ts`
  - `apps/desktop-react/src/core/backend/fixture-backend.ts`
  - `apps/sync-api/src/services/apply-command.ts`
  - `apps/desktop-react/src/core/services/entity-service.test.ts`
  - `apps/desktop-react/src/core/backend/fixture-backend.test.ts`
  - `apps/sync-api/tests/apply-command.test.ts`
  - Existing stage-only creation paths temporarily map to the first grade for their stage so the current React UI remains buildable until Task 2 introduces explicit multi-grade creation. Remote upsert application now persists the required grade.
- BookRow fixture updates required by the new invariant:
  - `apps/desktop-react/src/core/export/excel-export.test.ts`
  - `apps/desktop-react/src/core/services/academic-year-service.test.ts`
  - `apps/desktop-react/src/core/services/inventory-service.test.ts`
  - `apps/desktop-react/src/core/sync/conflicts.test.ts`
  - `apps/desktop-react/src/core/sync/sync-engine.test.ts`
  - `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
  - `apps/desktop-react/src/features/logs/LogsScreen.test.tsx`
  - `apps/desktop-react/src/features/students/StudentsScreen.test.tsx`
- Handoff:
  - `AGENTS.md`
  - Records verification, the unapplied remote migration, compatibility environment notes, and Task 2 as the exact next starting point.

## GREEN evidence

Mandated commands:

1. `npm run test -w @app/shared`
   - Passed: 5 files / 26 tests.
2. `npm run test -w @app/desktop-react -- --run src/core/db/production-data-continuity.test.ts`
   - Passed: 1 file / 2 tests, including upgraded SQLite `NOT NULL` continuity and preserved inventory reference.
3. `npm run test -w @app/sync-api -- --run tests/schema.test.ts`
   - Passed: 1 file / 7 tests.

Additional verification:

- `npm run test -w @app/desktop-react -- --run src/core/db/persistence.test.ts src/core/services/entity-service.test.ts src/core/backend/fixture-backend.test.ts`
  - Passed: 3 files / 11 tests.
- `npm run test -w @app/sync-api -- --run tests/apply-command.test.ts tests/schema.test.ts`
  - Passed: 2 files / 12 tests.
- `npm run test -w @app/shared`
  - Fresh final pass: 5 files / 26 tests.
- `npm run test -w @app/desktop-react`
  - Fresh final pass: 28 files / 82 tests, including React typecheck.
- `npm run test -w @app/sync-api`
  - Fresh final pass: 3 files / 16 tests.
- `npm run typecheck -w @app/sync-api`
  - Passed.
- `npm run typecheck -w @app/desktop`
  - Passed: Svelte check reported 0 errors and 0 warnings.
- `npm run db:generate -w @app/sync-api -- --name verify_grade_scoped_books`
  - Passed with `No schema changes, nothing to migrate`.
- `git diff --check`
  - Passed.

## Commit

Implementation commit: `b0a6f42c8716a5eb16f11b278bb6e05ba70ff428` (`feat: scope books to grade levels`).

## Self-review and concerns

- Confirmed the SQLite upgrade uses a canonical table rebuild and makes `grade_level` genuinely `NOT NULL`.
- Confirmed the continuity test preserves the exact book ID, both semester balances, timestamps/tombstone fields, and an existing `inventory_transaction_items.book_id` reference.
- Confirmed fresh schema and upgraded schema both expose the new partial unique index; the old index is removed.
- Confirmed Postgres migration ordering is populate-before-`SET NOT NULL` and its Drizzle snapshot matches the schema.
- Confirmed full package suites and rollback Svelte typecheck pass.
- No secrets were read or printed. No Neon branch was mutated.
- No blocker. Expected follow-up: Task 2 replaces the temporary first-grade stage-only adapters with atomic explicit multi-grade creation; Task 3 adds route-level grade validation and delete command application.
