# Grade-Scoped Books and Deletion Design

## Objective

Make book inventory grade-specific, prevent incompatible student-stage filters, and add safe student/book deletion across the offline SQLite client and the preserved sync protocol. The Windows app must remain fully usable without any network connection.

This release does not embed `DATABASE_URL` or `SYNC_API_SHARED_SECRET`. The current desktop only speaks the Hono `/sync/push` and `/sync/pull` protocol, so those values cannot create direct Neon connectivity. Hostless sync will use Neon Data API with authentication and row-level security in a separate implementation segment once the Neon endpoint and identity are provisioned.

## Considered Book Models

### 1. One persisted book per grade (selected)

Each book row owns one `educationStage`, one `gradeLevel`, and independent first/second-semester balances. The create sheet may select several grades and atomically creates one row per grade. Editing changes one persisted grade row.

This accurately models different physical textbooks and prevents Primary 1 stock from being consumed by Primary 2.

### 2. One book with a grade-assignment join table

This would let one row appear in several grades, but all assigned grades would share the same stock balances and audit stream. That conflicts with physical grade-specific inventory, so it is rejected.

### 3. Keep stage rows and filter only in the UI

This would not protect services, sync, exports, or other clients from incompatible issuance. It is rejected because grade scope must be a domain invariant.

## Domain and Persistence

- Add required `grade_level` to local SQLite and remote Postgres `books`.
- Keep `education_stage` as an explicit validated field for filtering and compatibility.
- Replace the active-book unique key `(scope_id, education_stage, name)` with `(scope_id, grade_level, name)`.
- Existing stage-only rows retain their IDs, stock, transactions, and issuance references. Migration maps them deterministically to the first grade of their stage: `kg1`, `primary1`, or `preparatory1`. The source data contains no reliable grade detail, so no stock is cloned or split.
- Book eligibility requires both the student's education stage and grade level to match.
- Excel exports include only books assigned to the exported grade.
- Book tables display both stage and grade.

## Multi-Grade Creation

- Creating a book requires a name, an education stage, and at least one grade from that stage.
- The creation sheet presents stage-specific grade checkboxes.
- Selecting multiple grades creates independent zero-stock book rows in one local transaction and queues one `UPSERT_BOOK` command per row.
- Editing an existing book edits only that row and uses one grade selector.
- Duplicate active `(grade, normalized name)` rows are rejected by persistence constraints and surfaced as a save error.

## Student Filter Behavior

- With education stage `all`, the grade filter shows all grades.
- With a concrete stage, the grade filter shows only that stage's grades.
- Changing stage resets an incompatible selected grade to `all` before filtering or export.
- Editor behavior remains stage-specific and continues resetting to the first compatible grade.

## Deletion Semantics

Deletion is a soft delete using the existing `deleted_at` columns.

### Students

- Only students in the current writable academic year can be deleted.
- A destructive confirmation dialog names the student.
- The active student list hides the row after deletion.
- Prior-year snapshots are independent records and remain unchanged/read-only.
- Existing issuance and inventory logs remain intact and continue resolving the deleted student's name.
- Any selected issuance draft is discarded only after deletion confirmation succeeds.

### Books

- A destructive confirmation dialog names the subject and grade.
- The active book list and future issuance choices hide the row after deletion.
- Existing stock transactions, issuance records, and cross-year audit history remain stored and resolvable by name.
- Deletion does not return issued stock or alter balances; transaction reversal remains the only operation that changes historical inventory effects.

## Sync Contract

- `UPSERT_BOOK` includes `gradeLevel` and validates that it belongs to `educationStage`.
- Add `DELETE_STUDENT { studentId, academicYear }`.
- Add `DELETE_BOOK { bookId }`.
- Local delete services update `deleted_at` and enqueue their tombstone command atomically.
- The sync API applies tombstones transactionally, records the resulting entity payload in `sync_changes`, and treats repeated commands as duplicates.
- Pull already upserts payloads containing `deletedAt`; validators will require the new grade field for books.
- Active server reads continue excluding tombstones while history records remain available.

## UI and Accessibility

- Use Lucide `Trash2` icons in existing table action groups.
- Delete actions stop row disclosure/selection propagation.
- Confirmation dialogs use destructive buttons, cancel buttons, entity names, busy states, and accessible labels.
- Archived academic years expose no student edit/delete controls.
- Book grade checkboxes and grade selector use translated grade labels.
- English and Arabic copy is added for grade scope, deletion confirmations, and success/error notices.

## Migration and Compatibility

- Add committed local migration `003_grade_scoped_books` without clearing students or transaction history.
- Add committed Drizzle migration `0003_grade_scoped_books.sql` for Neon.
- Update schema assertions and production-data-continuity tests.
- The preserved Svelte rollback frontend must still compile. Its frozen command adapter will provide a deterministic first grade for legacy stage-only book writes, but the active React frontend remains the only UI for grade selection and deletion.
- Apply the remote migration intentionally to each Neon branch only after all local suites pass.

## Error Handling

- Empty grade selection, incompatible stage/grade, missing entities, archived student deletion, and duplicate grade/name pairs fail without partial rows or outbox commands.
- Offline sync failures leave the local tombstone or new book rows committed and their commands pending.
- UI mutation errors keep dialogs open and announce translated failure feedback.

## Verification

- Shared tests: grade eligibility and new command shapes.
- Local service tests: multi-grade atomic creation, single-row edit, student/book tombstones, outbox commands, and rollback on invalid input.
- Migration tests: existing IDs, quantities, and history references survive with deterministic grades.
- Sync API tests: grade validation, wrong-grade issuance rejection, both delete commands, tombstone pull payloads, and route validation.
- React tests: stage-specific grade options, multi-grade creation, grade-only issuance, student deletion, book deletion, confirmations, and archived read-only behavior.
- Full `test`, `test:e2e`, `typecheck`, `lint`, `build`, Rust tests/check, production Tauri build, and production WebView smoke test.

## Hostless Neon Follow-Up

The next sync segment will provision Neon Data API on the target branch, add Neon Auth (or an external JWT provider), create `scope_id` RLS policies for every exposed table/function, and replace the HTTP Hono transport with direct Data API push/pull calls while retaining SQLite and the outbox. Neon will be the only remote online service. Owner-role database URLs will remain outside the executable.
