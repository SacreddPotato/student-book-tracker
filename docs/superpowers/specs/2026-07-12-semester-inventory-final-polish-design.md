# Semester Inventory And Automated Release Design

## Status And Scope

This design is the final product-polish segment for the React/Tauri desktop app and Hono/Neon sync service. It adds two independently stocked semesters to every subject, receipt metadata for stock increases, semester-aware student issuance and reversal, production and development database migrations, automated release tagging, and concise operator documentation.

The preserved Svelte workspace remains a rollback source. New product behavior is implemented in `apps/desktop-react`, `apps/sync-api`, and `packages/shared` only unless a compatibility contract requires otherwise.

## Decisions

- A book record represents a subject. Subjects are not duplicated per semester.
- Every subject has exactly two fixed inventory balances: first semester and second semester.
- Legacy `books.quantity` becomes first-semester quantity. Second-semester quantity starts at zero.
- Historical transaction items and historical student issuances are classified as first semester.
- Receipt number is text so leading zeros are preserved. Receipt date is an ISO calendar date in `YYYY-MM-DD` form.
- Receipt data belongs to the stock-increase transaction because one Add Stock operation targets one subject semester.
- Existing historical transactions may have null receipt fields. Every newly submitted stock increase requires both fields.
- Automated release tagging applies to successful non-bot pushes to `pre-release` and produces ordered normal GitHub releases using `0.1.0-demo.N` SemVer strings.

## Domain And Database Model

Add a shared `BookSemester` type with values `first` and `second`.

Replace the active `BookRow.quantity` contract with:

- `firstSemesterQuantity: number`
- `secondSemesterQuantity: number`

Add `semester: BookSemester` to each inventory transaction item and each student-book issuance. The student-book uniqueness key includes semester so a student may receive both semesters of the same subject in one transaction without ambiguity.

Add nullable fields to inventory transactions:

- `receiptNumber: string | null`
- `receiptDate: string | null`

Stock-increase transactions require both fields. Student-issue and reversal transactions store null. A reversal refers to the original transaction and carries inverse semester-aware items; the receipt remains visible on the original stock transaction.

### Local SQLite Migration

The new-database schema creates semester quantity columns instead of `quantity`, adds non-null semester columns with a `first` default, adds receipt fields, and uses the semester-aware student-book unique key.

Migration `002_semester_inventory_and_receipts` upgrades existing databases by:

1. Adding `first_semester_quantity` and `second_semester_quantity` to `books`.
2. Copying `quantity` into `first_semester_quantity` and setting `second_semester_quantity` to zero.
3. Adding `semester` to transaction items and student books with `first` as the historical value.
4. Adding nullable receipt number/date fields to inventory transactions.
5. Rebuilding the student-book uniqueness constraint if SQLite requires a table rebuild.

SQLite may retain the obsolete physical `quantity` column on upgraded databases, but repositories and sync snapshots must stop reading or writing it. Fresh databases do not create it.

### Neon Postgres Migration

The Drizzle schema mirrors the active local contract. The generated migration backfills the two quantity columns, semester fields, receipt fields, and semester-aware uniqueness constraint, then removes `books.quantity` after the backfill.

Historical `sync_changes` payloads remain readable. Pull normalization maps an old book payload's `quantity` to first semester, adds zero second-semester stock, and treats old item/issuance payloads as first semester. Pending legacy outbox commands are normalized before transport:

- Old `ADD_BOOK_STOCK` commands target first semester and use a stable legacy receipt marker plus the command occurrence date.
- Old `ISSUE_BOOKS_TO_STUDENT` `bookIds` become first-semester selections.

This prevents an upgrade from discarding unsynced local work.

## Sync Protocol And Server Behavior

`ADD_BOOK_STOCK` adds:

- `semester`
- `receiptNumber`
- `receiptDate`

`ISSUE_BOOKS_TO_STUDENT` replaces `bookIds` with `bookSelections`, an array of `{ bookId, semester }` pairs. Duplicate pairs are rejected while first and second semester of the same subject are valid together.

The sync API validates semester values, positive quantities, nonblank receipt numbers, and valid ISO receipt dates. Stock updates lock the subject row and mutate only the selected semester balance. Issuance locks every distinct subject row, validates education stage and selected-semester stock, then decrements the exact balances atomically. Reversal uses each original item's semester to restore or subtract the correct balance.

Book, transaction, transaction-item, and student-book change snapshots include the new fields. Conflict messages resolve subject names and add localized semester labels.

## React Desktop Behavior

### Books Workspace

Each subject remains one table row. The row presents first- and second-semester sections with independent quantity, stock status, and labelled Add Stock action. Editing a subject changes only its name and education stage and preserves both quantities.

The Add Stock dialog is opened for a specific subject and semester. It displays the selected semester and requires quantity, receipt number, and receipt date. Submission is locked while saving, validation remains visible, and failure keeps all entered values.

### Student Issuance

The issuance checklist becomes an accessible disclosure list. Each subject header is a button with `aria-expanded` and a chevron. Expanding it reveals two semester rows. Each semester row has an independent checkbox, available quantity, issued state, zero-stock disabled state, and draft state.

Draft selections use a stable composite key derived from subject ID and semester. A student may receive one or both semesters in a single atomic transaction. The existing unsaved-selection navigation guard applies to every semester selection.

### Logs, Conflicts, And Export

Every transaction item is labelled with subject and semester. Stock-increase logs show receipt number and receipt date. Reversal logs preserve the existing linkage and use semester-aware quantity-after values.

Conflict detail labels every requested subject semester. Excel exports create separate first- and second-semester columns for each subject and mark the exact issued semester.

English and Arabic dictionaries retain exact key parity. Arabic remains the startup language and all new disclosure, semester, receipt, log, and validation copy is localized.

## Release Automation

CI continues to validate pushes and pull requests. After the validation job succeeds on a non-bot `pre-release` push, a serialized tagging job:

1. Fetches the current `pre-release` tip and existing `v0.1.0-demo.*` tags.
2. Calculates the next unused demo sequence.
3. Updates `apps/desktop-react/package.json` and the root lockfile without creating an npm tag.
4. Commits the version change with the GitHub Actions bot identity and a CI-skip marker.
5. Creates and pushes an annotated `v<version>` tag.

Bot commits are excluded from the tagging job, preventing recursion. The tag-triggered Windows release workflow retains its quality gates, production overlay, signing boundary, artifact verification, and normal-release publication required by the updater's `releases/latest` endpoint. Manual dispatch remains an emergency fallback, not the normal release path.

## Migration Execution Checkpoint

Implementation proceeds in this order:

1. Create shared contracts, schema changes, migration files, compatibility normalizers, and application behavior.
2. Rehearse local SQLite and Postgres migration SQL against disposable databases and run focused pre-migration checks.
3. Confirm the untracked `apps/sync-api/.env` is configured and run the generated migration against the user-designated Neon production branch without printing credentials.
4. Inspect migration history and required columns/constraints on that connection.
5. Pause the goal and ask the user to replace `.env` with the Neon development-branch URL.
6. After the user continues, migrate the development branch and run the complete unit, integration, rendered browser, build, Rust, and native smoke suites.

Production migration is never inferred from a hostname label or committed URL. The user controls which Neon branch is in `.env`; documentation explains how to copy the branch-specific connection string, switch it safely, verify the selected endpoint, and keep credentials untracked.

## Error Handling And Invariants

- Semester is always `first` or `second` in new writes.
- Quantity is a positive integer for stock additions and exactly one unit per semester selection for issuance.
- Receipt number is trimmed and nonempty; receipt date must be a real ISO calendar date.
- Missing subjects, wrong education stages, duplicate selections, insufficient selected-semester stock, and double reversals fail before partial mutation.
- Sync remains idempotent by command ID.
- Local and remote multi-record changes remain transactional.
- A rejected command remains auditable after acknowledgement.
- Secrets, Neon URLs, and updater signing material are never committed or printed.

## Verification Contract

Focused tests cover schema migration/backfill, legacy outbox normalization, semester stock increase with receipt metadata, semester issuance, insufficient stock isolation, mixed-semester issuance, reversal, sync idempotency, pull normalization, conflict labels, exports, disclosure behavior, and form validation.

Final verification after the development-branch switch includes:

- Shared, React, sync API, and legacy workspace tests.
- React rendered Playwright workflows in English and Arabic RTL.
- Type checking, linting, workspace builds, and React production build.
- Cargo check for the React Tauri shell.
- Local SQLite migration of a copied legacy database.
- Neon development migration and schema inspection.
- Real Tauri smoke for semester stock, issuance, reversal, sync, and receipt display.
- Static workflow tests proving CI creates one ordered tag for an eligible push and excludes bot/pull-request events.

## Documentation And Handoff

README documents product capabilities, workspace layout, local development commands, required environment variables, and safe Neon production/development branch switching. The release runbook documents automated tagging and the manual fallback.

`AGENTS.md` is rewritten as a concise current-state handoff: active architecture, database and migration rules, release/updater boundaries, latest verification evidence, environment notes, and next starting point. Completed historical segment narration that no longer guides current work is removed.
