# AGENTS.md

## Handoff Rule

Update this file after every completed implementation segment. Keep current status, verification evidence, environment notes, and the exact next starting point accurate. Do not restore the historical segment-by-segment journal; Git contains that history.

## Product And Branch

- Default branch: `main` (MVP release line, merged from `pre-release`).
- `pre-release` remains the automatic ordered-demo release branch.
- Product: Windows-first, offline-first student and school-book inventory desktop app.
- Default UI: `apps/desktop-react` (React 19 + Vite + Tauri 2).
- Rollback UI: `apps/desktop` (preserved SvelteKit + Tauri 2; do not delete).
- Server: `apps/sync-api` (Hono + Drizzle + Neon Postgres).
- Shared contracts: `packages/shared`.

## Safety Boundaries

- React preview uses `com.studentbooktracker.reactdev` and `student-book-tracker-react.db`.
- React production preserves `com.studentbooktracker.app` and `student-book-tracker.db`.
- Never run legacy and React production-identity shells concurrently.
- `DATABASE_URL` and `SYNC_API_SHARED_SECRET` are server-only and belong in untracked `apps/sync-api/.env` or deployment secrets. Never expose them through `VITE_*`.
- The updater private key exists only in GitHub Actions secrets.
- Schema changes require a committed Drizzle migration and an intentional migration of each Neon branch.

## Current Domain Model

- Books are global across academic years and hold independent first/second-semester balances.
- Stock receipts require academic year, semester, positive integer quantity, issue receipt number, and issue receipt date.
- Issuance selects `{ bookId, semester }`; reversal restores the exact semester balance.
- Students, issuances, and inventory logs are academic-year scoped.
- Advancing must target the exact successor and requires a clean synchronized state.
- Promotion creates linked student snapshots in the new year; Preparatory 3 has no successor and is not copied.
- Prior years remain selectable and read-only. Books/balances remain global; new-year issuance/log history starts empty.
- Placeholder pre-migration data may be cleared by the semester/year migration.
- Excel subject cells use exactly: `0`, `1`, or  `2`, depending on how many books the student was issued per subject.

## Development Commands

From the repository root:

```powershell
npm run dev:desktop          # local sync API + React/Tauri preview
npm run dev:desktop:react    # desktop only; API already running
npm run dev:desktop:legacy   # preserved rollback frontend
npm run dev:api
npm run test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
npm run db:migrate -w @app/sync-api
```

Rust may require `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`.

## Release Automation

- CI validates every push/PR on Windows and runs rendered Chromium journeys.
- A successful non-bot push to `pre-release` enters one serialized job, computes the next `0.1.0-demo.N`, updates the React package/lockfile, commits as `github-actions[bot]`, and pushes an annotated tag.
- CI then calls the reusable signed Windows release workflow for that exact version.
- `v*` tag and manual dispatch triggers remain recovery paths.
- GitHub releases use ordered SemVer prerelease strings but are published with `prerelease: false`, because the configured `releases/latest` updater feed ignores releases marked as prereleases.

## Current Implementation Status

Completed and released as `v1.0.3` from merge `3a026687`:

- Auto-approved design committed scope: per-grade book rows with multi-grade creation, stage-dependent student grade filters, synchronized soft deletion for students/books, and preserved historical audit records.
- Existing stage-only book rows will keep their IDs, balances, and history while migration assigns the first grade of their stage; stock will not be cloned.
- Hostless Neon sync is designed as a separate follow-up using Neon Data API, authentication, and RLS. This feature release must remain offline-functional and must not embed owner database credentials or the server shared secret.
- Isolated baseline passed all 46 test files / 187 tests before implementation.
- The detailed five-task TDD plan is at `docs/superpowers/plans/2026-07-12-grade-scoped-books-and-deletion.md`; all implementation, migration, verification, and release tasks are complete.

Completed, released, and merged to `main`:

- Shared semester, academic-year, promotion, and sync contracts.
- Reset-capable local SQLite schema/migration and React repositories.
- Semester-aware entity/inventory services and academic-year rollover service.
- Postgres schema, Drizzle migrations, command validation/application, locking, and tests.
- React backend contract, fixture/SQLite backends, academic-year provider, sync pull, and semester conflict detail.
- React UI for semester stock receipts, subject disclosures, mixed-semester issuance, logs, read-only archives, initial year setup, typed rollover confirmation, and exact Excel states.
- Rendered rollover and inventory journeys.
- Cross-year expandable Books audit history with receipt, issuance, reversal, semester, student, and year metadata; full-row activation; accessible chevrons; and plus stock actions.
- A frozen local command contract keeps the preserved Svelte rollback frontend buildable without fabricating academic-year or receipt data; the active React frontend remains on the current shared protocol.
- Automatic CI version/tag/release workflow and updated operator documentation.

Latest verification:

```text
npm run test              passed: legacy 18/67, React 28/81, sync API 3/15, shared 5/24 (46 files / 187 tests)
npm run test:e2e          passed: 5 Chromium journeys, including all-year book audit expansion
npm run typecheck         passed across all workspaces
npm run lint              passed across all workspaces
npm run build             passed across all workspaces
cargo test                passed React Tauri database allowlist test
cargo check               passed React Tauri native compile
npm run tauri -w @app/desktop-react -- build --no-bundle --config src-tauri/tauri.production.conf.json
                          passed with VITE_SYNC_API_BASE_URL deliberately absent
production WebView check  passed: exact release binary rendered maximized Arabic UI, reported offline,
                          and created/read academic year 2025-2026 through local SQLite
npm run db:migrate -w @app/sync-api  passed idempotently against development Neon
post-merge npm run test    passed the same 46 files / 184 tests on main
main CI 29167478983        passed lint, typecheck, tests, 5 Chromium journeys, and build
```

Offline startup recovery checkpoint (2026-07-12):

- Root cause of the `v1.0.0` blank production window was eager module evaluation of a production runtime configuration that required `VITE_SYNC_API_BASE_URL`; release builds without that GitHub Actions Variable threw before React could render its startup fallback.
- Branch `codex/offline-safe-production-boot` now treats a missing or blank sync API URL as an intentional offline configuration, creates an unavailable sync client without making network requests, and resolves runtime configuration inside the caught asynchronous Tauri bootstrap path. Malformed non-empty URLs still fail validation.
- Local commands remain SQLite-backed and queued while sync is unavailable; no database URL or shared secret is embedded in the desktop application.
- The exact production-profile executable was built with the sync URL removed, inspected through its production WebView, and exercised through initial academic-year creation. The UI stayed Arabic, maximized, and explicitly offline.
- Package version `1.0.1` was merged to `main`, tagged, published as a signed Windows release, and independently verified against the GitHub asset digests and global updater feed.
- Accidental repository Variable copies of `DATABASE_URL` and `SYNC_API_SHARED_SECRET` were removed after confirming their Secret entries remained. Rotate the exposed Neon credential before future online-sync work. Only a public deployed HTTPS API origin belongs in `SYNC_API_BASE_URL` as a repository Variable.

Hostless Neon sync design checkpoint (2026-07-12):

- Track B architecture and TDD planning are complete on `codex/hostless-neon-sync`; no production code or migration was created in this segment.
- Approved design: keep SQLite/outbox/pull-cursor/conflict behavior, replace the normal hosted Hono transport with Neon Auth plus branch-level Neon Data API RPCs, expose only `sync_identity`, `sync_push`, and `sync_pull`, and derive the one active school `scope_id` inside PostgreSQL from `auth.user_id()` membership under forced RLS.
- `apps/sync-api` remains an explicit operator diagnostic/rollback adapter over the same SQL functions and is removed from normal desktop startup/runtime selection.
- Public release configuration becomes paired `NEON_AUTH_URL` and `NEON_DATA_API_URL` repository Variables mapped to `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL`. Owner URLs, management keys, JWT secrets, shared sync secrets, user credentials, and session tokens remain prohibited from desktop configuration.
- Track A's grade/deletion branch merges first and owns `0003_grade_scoped_books`; hostless schema implementation must merge/rebase updated `main` first and begin at `0004` or later. Track A and Track B ship in one combined release.
- Before auth implementation, a blocking production-profile Tauri spike must prove the exact WebView origin (`http://tauri.localhost` unless runtime evidence differs) can complete authentication, restart/session restoration, token refresh, sign out, and an authenticated Data API call without generic localhost access. If embedded Neon Auth is unsupported, prove a no-client-secret device-code or system-browser PKCE JWT flow whose JWKS works with the Data API.
- Design: `docs/superpowers/specs/2026-07-12-hostless-neon-sync-design.md`.
- TDD plan: `docs/superpowers/plans/2026-07-12-hostless-neon-sync.md`.
- Planning verification passed: official Neon Data API/Auth documentation was refreshed on 2026-07-12; current client/engine/routes/schema/release paths were inspected; spec and plan placeholder, consistency, scope, type/interface, and `git diff --check` reviews passed.

Release checkpoint (2026-07-12):

- Branch CI run `29188600139` passed lint, typecheck, all 187 tests, five rendered Chromium journeys, and the workspace build for recovery commit `a994ff6`.
- Merge commit `dd996c1` passed main CI run `29188764244`; annotated tag `v1.0.1` points to that exact merge.
- Signed Windows release workflow `29188855243` passed release-source validation, quality gates, optimized native packaging, updater verification, and publication.
- Release: `https://github.com/SacreddPotato/student-book-tracker/releases/tag/v1.0.1`.
- EXE: `Student.Book.Tracker_1.0.1_x64-setup.exe`, 4,414,078 bytes, SHA-256 `3207b035888c869cfe77883fd120d18c868d6027c4aadd03f492a68cac8b4faf`; downloaded ProductVersion and FileVersion both report `1.0.1`.
- Updater signature SHA-256: `78afc0965e8247b833a44ee8aecd61e95c0109223cbc06c3e514a6fe25af0cd3`.
- `latest.json` SHA-256: `b8d9d72261bf950ef56fb0a64cc56efbd8b0e8eb4ce872b718242323c83d9944`; the global `releases/latest` feed matched byte-for-byte, reported version `1.0.1`, and exposed matching signed `windows-x86_64` and `windows-x86_64-nsis` targets.

Release checkpoint (2026-07-11):

- Automatic demo pipeline run `29166329410` passed and published `v0.1.0-demo.8` after validating the immutable tag source.
- Demo EXE: `Student.Book.Tracker_0.1.0-demo.8_x64-setup.exe`, 4,414,787 bytes, SHA-256 `35fbfe042d9cea768a24ffcc3d387ea9ce65561c3fa4d78e3ca6c7647417524a`.
- Tags `v0.1.0-demo.6` and `v0.1.0-demo.7` were validation-only tags created while hardening the workflow; neither was published as a release. `v0.1.0-demo.8` is the verified published demo.
- Stable workflow run `29166844125` passed and published `v1.0.0` from commit `a2268c9`.
- Stable EXE: `Student.Book.Tracker_1.0.0_x64-setup.exe`, 4,413,283 bytes, SHA-256 `2e1fe0c1783ce469fd74162a5b73e5cbe65c4444616fc1b07f8ab82cef89abe5`.
- Stable `latest.json` SHA-256 is `e30e2f65d98c2c70f08c0a4dbc213a1abd31159b83583828cdd30b9b50be3cb1`; the global `releases/latest` feed matched it byte-for-byte and reported both Windows updater targets at `1.0.0`.
- GitHub default branch is `main`; merge commit `9a47e78` passed CI run `29167478983`.

Production Neon migration checkpoint (2026-07-11 18:52 Cairo):

- The exact Drizzle history was rehearsed successfully on disposable PostgreSQL 17 before the production mutation.
- Applied `0001_semester_inventory_academic_years.sql` and `0002_drop_legacy_book_quantity.sql` to the user-designated production Neon target; Drizzle now reports three migration rows including the baseline.
- Redacted target fingerprint: `8479f751bcff`. The `.env` remained ignored and no credential was printed or committed.
- Read-only catalog inspection confirmed `academic_years`, both book semester balances, student/transaction academic year columns, receipt fields, item/issuance semester columns, nonnegative/check/unique constraints, and the semester-aware student-book uniqueness constraint.
- `academic_years`, books, students, transactions, items, student books, and `sync_changes` all contained zero rows after migration, as expected for placeholder-data reset.
- Pre-mutation suites passed: shared 5 files/24 tests, React core 9 files/26 tests, sync API 3 files/15 tests, React typecheck, and sync API typecheck.

Development Neon migration checkpoint (2026-07-11):

- Applied the same committed migration history to the user-confirmed development Neon branch.
- Redacted target fingerprint `7368381c29be` differs from production fingerprint `8479f751bcff`; `.env` remained ignored and no credential was printed or committed.
- Read-only inspection confirmed three Drizzle migration rows and all academic-year, semester balance, receipt, and semester transaction/issuance columns.
- `academic_years`, books, students, transactions, items, student books, and `sync_changes` all contained zero rows after migration.
- The expandable audit uses the existing transaction/item schema and requires no additional database migration.

Grade-scoped contracts and schema checkpoint (2026-07-12):

- Branch `codex/grade-scoped-delete` completed Task 1 from the grade-scoped books and deletion plan.
- Shared issuance eligibility now requires matching education stage and grade; book upserts require `gradeLevel`; and the shared command union includes `DELETE_STUDENT` and `DELETE_BOOK` shapes.
- Fresh SQLite databases create `books.grade_level TEXT NOT NULL` and the active-row `books_scope_grade_name_unique` index. Migration `003_grade_scoped_books` rebuilds the table so upgraded databases also enforce `NOT NULL`, deterministically maps `kg`/`primary`/`preparatory` rows to `kg1`/`primary1`/`preparatory1`, and preserves IDs, semester balances, timestamps, tombstones, and string-ID inventory references.
- Postgres migration `0003_grade_scoped_books.sql`, its Drizzle journal entry, and snapshot are committed but have not been applied to either Neon branch. Drizzle reports no remaining schema diff.
- The current stage-only React and fixture creation paths assign the first grade for compatibility; Task 2 replaces those adapters with the planned explicit multi-grade creation service.
- Full package verification passed: shared 5 files / 26 tests, React 28 files / 82 tests, sync API 3 files / 16 tests, React and sync API typechecks, and the preserved Svelte rollback typecheck (0 errors / 0 warnings). The focused SQLite continuity suite passed 1 file / 2 tests, and Drizzle reported no remaining schema diff.
- No secret values were read or exposed, and no remote database was mutated during this segment.

Atomic local creation and deletion checkpoint (2026-07-12):

- Task 2 now exposes exact grade-aware `BookInput`, atomic `saveBooks`, and synchronized `deleteStudent` / `deleteBook` APIs across the SQLite and fixture backends.
- Multi-grade creation validates the complete grade selection before opening one local transaction, then creates one independent zero-stock book and `UPSERT_BOOK` outbox command per grade. Single-row edits preserve both semester balances and `createdAt` and cannot fan out.
- Student deletion is limited to an active student in the current academic year. Student and book deletion use one timestamp for `deletedAt` / `updatedAt` and queue the matching tombstone command in the same transaction.
- Normal student/book lists remain active-only. Log composition uses include-deleted repository lookups so tombstoned names remain visible in audit history.
- The temporary `LegacyBookInput` / `saveBook` adapters have been removed; every active React book write now uses explicit grade-aware `saveBooks` input.
- Required focused verification passed 3 files / 19 tests; React typecheck passed; the full React suite passed 28 files / 92 tests.
- Task 2 received a fresh inline review and rerun of its required focused suite (3 files / 19 tests). The user paused the independent hostless-sync worktree and directed this feature branch to ship on its own as `v1.0.3`.

Remote grade and tombstone checkpoint (2026-07-12):

- The sync route now requires `UPSERT_BOOK.book.gradeLevel`, accepts `DELETE_STUDENT` / `DELETE_BOOK`, and rejects malformed grade-less book payloads.
- Remote upserts validate that a book grade belongs to its education stage. Issuance requires both the student's stage and exact grade.
- Student deletion requires the current academic year and matching active snapshot; book deletion preserves balances. Both commands set `deletedAt` / `updatedAt`, record the complete tombstone in `sync_changes`, and remain duplicate-safe.
- Drizzle and memory stores implement active-only tombstone mutations; Postgres book conflict updates now include `gradeLevel`.
- Pull regression coverage confirms tombstones disappear from active lists while include-deleted audit lookups retain names.
- TDD RED observed four intended failures (wrong-grade issuance accepted, two missing tombstones, route 400). GREEN passed sync API 2 files / 13 tests, React sync engine 1 file / 5 tests, React typecheck, and sync API typecheck.

Grade-aware React workflow checkpoint (2026-07-12):

- Book creation now offers only grades in the chosen education stage and creates one independent zero-stock subject row for every selected grade. Editing remains a single-row grade-aware operation.
- Book inventory rows expose grade, edit, stock, audit, and confirmed delete actions. Student filters show only grades in the selected stage; issuance and Excel export use the student's exact grade rather than stage-wide books.
- Current-year students and global books have explicit destructive confirmation dialogs. Archived student snapshots remain read-only and expose no delete action; successful selected-student deletion clears draft issuance state only after persistence succeeds.
- SQLite, fixture, UI, and export paths all enforce exact-grade eligibility. The temporary grade-less `saveBook` compatibility API was removed from services, backends, types, and tests.
- TDD RED captured the seven missing rendered/export behaviors and the same-stage wrong-grade local issuance gap. Focused GREEN verification passed 6 files / 34 tests with React typecheck.

Grade-scoped migration rehearsal and development checkpoint (2026-07-12):

- PostgreSQL 17 disposable rehearsal applied the complete four-migration Drizzle history twice successfully. A separate pre-`0003` upgrade rehearsal preserved representative KG, Primary, and Preparatory book IDs plus both semester balances while mapping them to `kg1`, `primary1`, and `preparatory1`.
- Rehearsal inspection confirmed `books.grade_level` is `NOT NULL` and only `books_scope_grade_name_unique` remains. The temporary PostgreSQL container was stopped and removed.
- Applied `0003_grade_scoped_books.sql` idempotently to the configured development Neon target and verified four migration rows, the non-null column, and the grade-scoped unique index at redacted fingerprint `7368381c29be`.
- Added a manual production migration workflow and reusable verifier. The workflow requires typed confirmation, reads the database only from GitHub Secrets, locks execution to known production fingerprint `8479f751bcff`, and verifies the schema without printing the URL.
- A plaintext repository Variable copy of `DATABASE_URL` had been reintroduced and was removed. The GitHub Secret remains; rotate the now-exposed Neon credential before online sync resumes. No database credential is bundled into the desktop.
- Full pre-release gates passed at this checkpoint: 46 files / 211 tests, five Chromium journeys, workspace lint/typecheck/build, Rust database allowlist test, and `cargo check`.

`v1.0.3` production candidate checkpoint (2026-07-12):

- Release metadata moved directly from `1.0.1` to `1.0.3`; no `1.0.2` tag or release is created.
- Built the exact production-identity executable with `VITE_SYNC_API_BASE_URL` absent. Windows ProductVersion and FileVersion both report `1.0.3`.
- To avoid Windows resolving the shared production identity to the installed `v1.0.1` executable, the newly built binary was copied under a unique smoke-test filename and launched from the worktree. The underlying bytes were unchanged.
- A clean restart rendered maximized at 1920x1032, Arabic, and explicitly offline. The custom maximize action also restored a normal window to the full workspace.
- Live local SQLite/WebView exercise created one subject for Primary 1 and Primary 2 as two independent zero-stock rows, exposed grade and delete controls on each row, and restricted the student grade dropdown to the selected stage. Rendered tests cover both destructive confirmation flows and archived-year delete suppression.
- The production smoke process was closed. Smoke data is placeholder-only under the user-approved local production database and can be removed through the new confirmed delete flow.
- Final post-version verification passed sequentially: 46 files / 211 tests, workspace lint, workspace typecheck, five Chromium journeys, and all workspace builds. Test and lint must not be launched concurrently because both run `svelte-kit sync` against the preserved legacy frontend's generated `.svelte-kit` directory.

`v1.0.3` release checkpoint (2026-07-13 Cairo):

- Merge `3a02668793c78e88bcb46e49665bba3af1d3c14e` passed main CI run `29209522207`, including lint, typecheck, all 211 tests, five rendered Chromium journeys, and the workspace build.
- Production migration workflow `29209627851` applied the committed Drizzle history and verified fingerprint `8479f751bcff`, four migration rows, `grade_level NOT NULL`, and `books_scope_grade_name_unique` without exposing the database URL.
- Annotated tag `v1.0.3` points to the exact verified merge. Signed Windows release workflow `29209655973` passed source validation, release quality gates, optimized packaging, signature/updater verification, and publication.
- Release: `https://github.com/SacreddPotato/student-book-tracker/releases/tag/v1.0.3`.
- EXE: `Student.Book.Tracker_1.0.3_x64-setup.exe`, 4,418,030 bytes, SHA-256 `ed635537f27591738e01fcdcf0a4434a8d74ac992499e3f57de3f4a34750ad49`; downloaded ProductVersion and FileVersion both report `1.0.3`.
- Updater signature SHA-256: `f3bcacbe5494196ba2041a1094e9be4d9dcdffd6458387ae44d68f9ad83e6ae0`.
- `latest.json` SHA-256: `d654df09e46a526630fc203524a503168c5f199b952dfe5284d95d1ad65056e4`; the global `releases/latest` feed matched byte-for-byte, reported version `1.0.3`, and exposed matching signed `windows-x86_64` and `windows-x86_64-nsis` targets.
- The plaintext repository Variable copy of `DATABASE_URL` was removed while its Secret entry remained. Rotate the exposed Neon credential before any online-sync work.

Hostless PostgreSQL procedure checkpoint (2026-07-13 Cairo):

- Branch `codex/hostless-neon-sync` now contains immutable migration `0004_hostless_direct_neon_sync.sql` on top of the merged `v1.0.3` baseline.
- The migration clears the approved placeholder remote rows, creates `applied_sync_commands`, installs fixed-search-path `sync_api.sync_push(jsonb)` and `sync_api.sync_pull(bigint)`, and moves their ownership plus private handlers to `student_book_sync_runtime`.
- The push procedure covers all nine shared command discriminants, stable accepted/rejected replay, synchronized student/book tombstones, exact academic-year advancement, grade checks, semester inventory, issuance, reversal, advisory command locking, and row locks for concurrent stock mutations.
- TDD RED first captured missing migration/table/function contracts. A real PostgreSQL failure then isolated an issue-selection operator-precedence defect; parenthesizing the JSON extractions made the same concurrent/lifecycle tests pass.
- Disposable PostgreSQL 17 applied migrations `0000` through `0004` twice. The verifier reported five migrations, `grade_level` non-null, the grade index, both public procedures owned by `student_book_sync_runtime`, no public execution, and zero post-cutover rows at redacted disposable fingerprint `ad9dc258792f`.
- Fresh Task 1 verification passed sync API 4 files / 25 tests with the real PostgreSQL integration suite enabled, plus sync API typecheck. The exact disposable container was removed afterward.

Restricted Neon client-role checkpoint (2026-07-13 Cairo):

- `sync-role.ts` derives only a pooled `student_book_sync_client` URL from an owner Neon URL, preserves database/TLS parameters, and redacts credentials from all reports and errors.
- Provisioning is idempotent and fixes the login role at `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`. It revokes inherited/table/sequence/private-function privileges, then grants only database connect, `sync_api` schema usage, and execution of the exact push/pull procedures.
- A fresh PostgreSQL 17 permission matrix proved push/pull access while direct select, insert, update, delete, private-function execution, schema creation, and role creation all failed through the restricted connection.
- The `db:provision-sync-role` CLI requires the owner URL plus a generated client-role password, prints only a redacted JSON report, supports a mode-0600 pooled URL output file for operator handoff, and emits no PostgreSQL privilege warnings.
- `docs/runbooks/database-migrations.md` documents migration, restricted-role rotation, redacted verification, and the explicitly accepted extractable-client-credential threat model.
- Fresh Task 2 verification passed the live role suite (1 file / 5 tests), the normal sync API suite (4 files / 26 tests with four live checks skipped), and sync API typecheck. The exact disposable container was removed afterward.

## Next Starting Point

1. Execute Task 3 in `docs/superpowers/plans/2026-07-12-hostless-neon-sync.md`: add the validated pooled Neon runtime configuration and direct desktop push/pull transport.
2. Keep the owner `DATABASE_URL` and `SYNC_API_SHARED_SECRET` out of the desktop. Only the dedicated `student_book_sync_client` pooled URL may be compiled into trusted-client releases.
3. Preserve offline-first SQLite behavior and the existing Rust-backed local transaction path throughout implementation.
