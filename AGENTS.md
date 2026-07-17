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
npm run dev:desktop          # React/Tauri preview; direct Neon when configured, otherwise local-only
npm run dev:desktop:react    # desktop only; API already running
npm run dev:desktop:legacy   # preserved rollback frontend
npm run dev:api              # optional preserved Hono API development
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

Direct desktop Neon transport checkpoint (2026-07-13 Cairo):

- React runtime configuration now accepts only `VITE_NEON_SYNC_DATABASE_URL` with PostgreSQL protocol, a pooled `*.neon.tech` endpoint, a nonempty database/password, and exact username `student_book_sync_client`. Blank configuration remains intentionally offline, and invalid configuration errors never echo the URL or password.
- `NeonDirectSyncClient` calls only `sync_api.sync_push($1::jsonb)` and `sync_api.sync_pull($1::bigint)` through the pinned `@neondatabase/serverless@1.1.0` HTTP driver. It validates complete push/pull response shapes and hides driver errors that could contain connection details.
- Tauri initializes local SQLite before constructing the optional Neon client. The unavailable client still queues all local mutations without a network request, preserving offline-first startup and the Rust-backed local transaction path.
- The default desktop development command no longer launches Hono. `dev:api` and `FetchSyncApiClient` remain available for isolated server/rollback tests, but are outside the production runtime.
- Windows release builds receive only `secrets.NEON_SYNC_DATABASE_URL` as `VITE_NEON_SYNC_DATABASE_URL`; the old API URL/shared-secret build variables are removed. The release runbook documents that this restricted credential is intentionally extractable on trusted machines.
- TDD RED captured the missing direct transport and runtime fields. Fresh GREEN verification passed the focused 3-file / 27-test suite, the complete React suite (29 files / 111 tests), React typecheck, and the React production web build.

Local hostless-sync cutover checkpoint (2026-07-13 Cairo):

- SQLite migration `004_hostless_sync_cutover` clears the user-approved placeholder sync universe exactly once: issued-book rows, transaction items/headers, students, books, academic years, outbox rows, sync cursor/error state, and only the conflict-acknowledgement setting. Unrelated preferences and schema/indexes remain intact.
- All migration statement batches now use `runLocalTransaction`; Tauri therefore executes them through the existing Rust-backed atomic transaction command instead of JavaScript `BEGIN`/`COMMIT`. Fresh databases run the empty cutover harmlessly, and mutations made after its migration record are never cleared.
- Pending outbox reads are deterministic and capped at 100 with `ORDER BY created_at, id`. One sync request repeatedly pushes complete bounded batches, atomically validates/applies each result set, and pulls only after the pending queue drains.
- Missing, duplicate, or unknown remote results are rejected before any status mutation. A first-batch transport failure leaves all 101 test commands pending.
- Direct Neon driver failures now become a credential-redacted `TypeError`, so the existing sync status correctly reports offline rather than exposing connection details.
- TDD RED proved the absent migration and former 101-command single push. Fresh GREEN verification passed the required 4-file / 19-test regression set and the complete React suite (29 files / 115 tests), including React typecheck.

Rotated Neon hostless verification checkpoint (2026-07-13 Cairo):

- The project-scoped Neon API key and project ID remained in the ignored operator `.env`; they were used only to discover the designated production/development branches and obtain connection strings in process memory. No credential value was printed, committed, or copied into a repository Variable.
- Migration `0004` now accommodates Neon's non-superuser owner model by temporarily granting the runtime role schema creation only while transferring function ownership, revoking it immediately afterward, and retaining non-inherited owner membership so future migrations can manage the functions. This is PostgreSQL privilege plumbing only; the application still has one unauthenticated global dataset with no user/tenant owner.
- Restricted-role provisioning was rehearsed as a `CREATEROLE` non-superuser owner. It creates or rotates `student_book_sync_client` without a `DO`-block self-grant, verifies safe catalog attributes, revokes all inherited/direct access, and grants only connect, `sync_api` usage, and the two procedure executions.
- Applied the complete five-migration history to production branch `br-round-flower-as37e98s` and development branch `br-super-salad-aswaapne`. Redacted owner/restricted fingerprints are production `dbaca31802f5` / `8479f751bcff` and development `53bd50038a42` / `7368381c29be`.
- Both targets passed catalog and negative-permission verification: exact runtime-owned `SECURITY DEFINER` functions, no `PUBLIC` execution, no direct client table grants, push/pull callable, and direct table reads, private-function execution, and schema creation denied. Both targets were left with zero cutover rows.
- Production GitHub Secrets now contain the rotated direct owner URL, expected owner fingerprint, and restricted pooled `NEON_SYNC_DATABASE_URL`. No owner URL or server shared secret is mapped into the desktop build.
- A live development proof used two independent SQLite profiles through the restricted Neon HTTP connection. It exchanged academic-year initialization, grade-scoped book/stock/student data, issuance, reversal, both tombstones, an offline queued book, and year rollover; both devices drained their outboxes and converged to the same cursor. The development branch was cleaned afterward and the empty-target verifier passed.
- Fresh focused verification passed sync API schema/integration tests (10 passed, 3 live-gated skipped), the complete sync API suite (27 passed, 4 live-gated skipped), sync API typecheck, desktop live integration typecheck, the enabled two-device Neon journey (1 passed in 7.28 seconds), and a fail-closed empty-target development verification.

`v1.0.4` hostless release candidate checkpoint (2026-07-13 Cairo):

- Release metadata advanced from `1.0.3` to `1.0.4`. The exact production-identity native executable reports ProductVersion and FileVersion `1.0.4`.
- Sequential pre-release gates passed: legacy 18 files / 67 tests, React 29 files / 115 tests with the live-only suite gated, sync API 4 files / 27 tests with the live PostgreSQL suite gated, shared 5 files / 26 tests, workspace lint/typecheck/build, five Chromium journeys, the Rust database allowlist test, and `cargo check`.
- The URL-less production profile built and rendered maximized at 1920x1032 in Arabic with the initial academic-year dialog, confirming the preserved offline startup path. The offline-created initialization command was subsequently visible in the local outbox and drained after online startup.
- The production restricted URL independently called `sync_api.sync_pull(bigint)` with no Hono process. The online production profile then built with only `student_book_sync_client`; bundle inspection found the restricted Neon endpoint and no `neondb_owner` credential.
- The online executable SHA-256 is `6a44976c541fb41944fa445e612f5ce652fe0733f8114e9a7c18dcd23a249da5` before installer packaging. Local SQLite recorded pull cursor `1`, a fresh `last_synced_at`, no `last_error`, and the command as `synced`; the user independently confirmed the UI status changed to synchronized.
- The first post-merge Windows run exposed one LF-only static SQL assertion against a CRLF checkout. The test now normalizes line endings before exact multiline checks; its focused 10-test suite and the complete merged 46-file suite passed afterward.
- Main CI `29248517488` passed, but the first protected migration confirmation correctly stopped before tagging because the schema verifier still treated a now-live production target as required-empty. Empty-row enforcement is now opt-in through `REQUIRE_EMPTY_SYNC_TARGET=1`; schema/fingerprint/function verification remains mandatory. RED reproduced the failure, and GREEN passed the focused 10 tests, complete sync API suite (27 passed / 4 live-gated), and sync API typecheck.

`v1.0.4` release checkpoint (2026-07-13 Cairo):

- Stable tag `v1.0.4` points to exact main commit `3ed55c44e85669bfdce44c46898b3fae9132b965`. Main CI run `29248914994` passed lint, typecheck, all workspace tests, five rendered Chromium journeys, and the workspace build.
- Protected production migration run `29249152101` applied the committed history idempotently and passed the rotated fingerprint/schema/function verification against the live production target.
- Signed Windows release workflow `29249211290` passed source/version validation, complete quality gates, optimized native packaging, installer/signature/updater verification, and publication.
- Release: `https://github.com/SacreddPotato/student-book-tracker/releases/tag/v1.0.4`.
- EXE: `Student.Book.Tracker_1.0.4_x64-setup.exe`, 4,456,748 bytes, SHA-256 `c29c3c34432e011211cb915631bcd1d6b44f5661b1395519fb766abb8a4e8f7a`; downloaded ProductVersion and FileVersion both report `1.0.4`.
- Updater signature: 436 bytes, SHA-256 `392320a269945a6b485128b96f6beec03e849605bb6937f387807521f2450d2e`.
- `latest.json`: 1,354 bytes, SHA-256 `635d836298c514dd25888dde0a0a2bf3b2e566cb170f23bd22ec0ef0b9604196`; the global `releases/latest` feed matched byte-for-byte, reported version `1.0.4`, and exposed matching `windows-x86_64` and `windows-x86_64-nsis` targets.

Excel export refinement checkpoint (2026-07-13 Cairo):

- `StudentsWorkbookInput` now requires the selected academic year and accepts translation interpolation values. The Students screen passes its selected `viewYear`, so archived-year exports print the year being viewed rather than the latest year.
- The fixed `A/D/G:H` header was replaced by a symmetric three-region layout that keeps equal school/logo side spans and merges the true center across the actual printable width. The approved center contains only the localized full grade and populated academic year; Arabic Preparatory 2 renders as `الصف الثاني الإعدادي`.
- Arabic workbook cells now persist RTL reading order after XLSX serialization. Arabic text is right-aligned, central/column headings and `0`/`1`/`2` values are centered, and English retains explicit LTR alignment.
- Printing is landscape, horizontally centered, fitted to one page wide with unrestricted vertical pagination, and limited to the calculated header/body range.
- TDD RED captured the missing two-line center merges, RTL cell alignment metadata, and print setup. Fresh GREEN verification passed the focused export suite (1 file / 6 tests) and React typecheck.

Initial academic-year sync gate checkpoint (2026-07-13 Cairo):

- `AcademicYearProvider` now observes `backend.syncStore` and exposes `setupReady`. It still reads local academic years immediately, but an empty database cannot open the setup modal while the first sync is `idle` or `syncing`.
- Every terminal sync phase (`synced`, `rejected`, `offline`, or `error`) triggers a fresh SQLite academic-year read before setup becomes eligible. A year pulled from Neon is therefore adopted without prompting, while an empty offline/error result enables local initialization immediately after the failed attempt.
- Existing local-year users remain usable while synchronization is pending. Later reconnect attempts reuse the same gate and refresh path, preventing stale provider state from reopening the duplicate initialization race.
- TDD RED reproduced both failures: the setup dialog opened during `idle`, and a pulled year left the provider at `unset`. Fresh GREEN verification passed the focused export/provider/dialog/lifecycle set (4 files / 21 tests), React typecheck, and the complete React suite (29 passed files / 126 tests with one live-only test skipped).

Excel print-preview QA checkpoint (2026-07-13 Cairo):

- A representative Arabic Preparatory 2 workbook was generated directly from the final exporter with two students, four subjects, and `0`/`1`/`2` issuance states. ExcelJS reload confirmed the exact grade/year values, RTL/right/center alignments, symmetric merges, blank signature cells, and calculated `A1:H7` print area.
- Microsoft Excel opened the generated XLSX read-only and confirmed landscape orientation, one-page-wide fitting with unrestricted height, horizontal centering, and the same print area. Its exported print-preview PDF rendered the full `الصف الثاني الإعدادي` header and `2025-2026` year in the correct visual order.
- Excel's bidi layout initially displayed an unisolated year as `2026-2025` inside an RTL cell. A focused RED test captured the defect; the exporter now wraps only the Arabic academic-year token in invisible left-to-right marks. The GREEN export suite passed 1 file / 6 tests, while English output remains unmarked and LTR.

Excel and startup-race final verification checkpoint (2026-07-13 Cairo):

- Sequential workspace verification passed: legacy 18 files / 67 tests; React 29 passed files / 126 tests with one live-only test skipped; sync API 4 passed files / 27 tests with four live-gated tests skipped; and shared 5 files / 26 tests.
- Workspace typecheck and lint passed across all four packages. All five rendered Chromium journeys passed, including the student/export workflow, and every workspace build completed successfully.
- `git diff --check` passed after the final review. This refinement changes only React UI/export/provider code, translations, tests, and this handoff; it requires no database migration or credential change.

`v1.0.5` release candidate checkpoint (2026-07-13 Cairo):

- At the user's request, desktop package and lockfile metadata advanced from `1.0.4` to `1.0.5`; the Tauri configuration continues to resolve its version from the React package.
- The candidate contains only the verified Excel export and first-run synchronization refinements. It adds no schema migration and requires no database or credential mutation.
- The branch remains ready for a verified merge to `main`, main CI, and the signed Windows release workflow. Do not move the `v1.0.5` tag away from the exact main commit validated by that workflow.

`v1.0.5` release checkpoint (2026-07-13 Cairo):

- Merge `be890334c66e251a7f0e43821de69c19fdf537ca` passed local post-merge tests and main CI run `29255806734`, including lint, typecheck, all workspace tests, five rendered Chromium journeys, and the workspace build.
- Signed Windows release workflow `29256097528` validated that exact merge, created annotated tag `v1.0.5`, repeated the complete quality gates, built the signed installer/updater artifacts, verified them, and published the release.
- Release: `https://github.com/SacreddPotato/student-book-tracker/releases/tag/v1.0.5`.
- EXE: `Student.Book.Tracker_1.0.5_x64-setup.exe`, 4,457,890 bytes, SHA-256 `aec93a60ab426ab6209996ff7fbb7fe6b5378e30c1c5032fbf9fa9279dcad629`; downloaded ProductVersion and FileVersion both report `1.0.5`.
- Updater signature: 436 bytes, SHA-256 `bfb25343849daa763963cde438a3953fa08053f64765c2d5f331f6167f5e2aab`.
- `latest.json`: 1,354 bytes, SHA-256 `a6e25f3f05510f36a652e357986a0d9f76b0e75540869f6cdeb62a3ad3915287`; the global `releases/latest` feed matched byte-for-byte, reported version `1.0.5`, and exposed matching `windows-x86_64` and `windows-x86_64-nsis` installer targets.
- This release required no database migration or credential change. The isolated feature worktree and merged feature branch were removed after successful post-merge verification.

Excel table grid checkpoint (2026-07-13 Cairo):

- Student Excel exports now merge the signature heading and every signature body cell through the final printable column, so narrow subject sets use the complete page width without exposing empty filler columns.
- Thin borders frame every logical name, subject, and signature cell from the table heading through the final student row. The school/grade/logo header and spacer row remain unchanged.
- TDD RED reproduced the absent signature merges and borders. GREEN serialization coverage passed the focused export suite (1 file / 8 tests) plus React typecheck for both narrow and wide subject sets.
- A production-generated Arabic Preparatory 2 workbook opened read-only in Microsoft Excel with exact `F5:H5`, `F6:H6`, and `F7:H7` signature merges, blank signature values, `A1:H7` print area, landscape one-page-width fitting, correct `2025-2026` order, and a visually continuous row-separated grid.
- Sequential final gates passed: legacy 18 files / 67 tests; React 29 passed files / 128 tests with one live-only test skipped; sync API 4 passed files / 27 tests with four live-gated tests skipped; shared 5 files / 26 tests; workspace typecheck/lint/build; and all five rendered Chromium journeys.
- At the user's request, desktop package and lockfile metadata advanced from `1.0.5` to `1.0.6`. This formatting-only release requires no database migration or credential change.

`v1.0.6` release checkpoint (2026-07-13 Cairo):

- Merge `79eb7f048a605ca3010853aea3efbde8f752b7ff` passed the local post-merge workspace suite and main CI run `29258923207`, including lint, typecheck, all tests, five rendered Chromium journeys, and the workspace build.
- Signed Windows release workflow `29259478655` validated that exact merge, created annotated tag `v1.0.6`, repeated the quality gates, built and verified the signed installer/updater artifacts, and published the release.
- Release: `https://github.com/SacreddPotato/student-book-tracker/releases/tag/v1.0.6`.
- EXE: `Student.Book.Tracker_1.0.6_x64-setup.exe`, 4,459,870 bytes, SHA-256 `a1519c2e50009099527bf871bf893d007c1dbf1cacdf158d45d592e80750b2a7`; downloaded ProductVersion and FileVersion both report `1.0.6`.
- Updater signature: 436 bytes, SHA-256 `ea511d48e58baacdebdfd9722460d9a56210e2a4c2a2dddaf0c99acc761b5364`.
- `latest.json`: 1,354 bytes, SHA-256 `0e46ea68ab174694b6383fcc5ffef06eb4be81c21873b1f2e47a8162aa686087`; the global `releases/latest` feed matched byte-for-byte, reported version `1.0.6`, and exposed matching `windows-x86_64` and `windows-x86_64-nsis` targets.
- The isolated worktree and merged feature branch were removed. No database migration or credential change was needed.

Protected deletion and book audit export checkpoint (2026-07-17 Cairo):

- Branch `codex/protected-delete-book-export` adds a minimal password field to the shared student/book deletion dialog. Delete confirmation remains disabled until a password is entered, accepts only the exact case-sensitive password `az2006`, shows a localized inline error for a wrong value, and resets the password/error whenever the dialog is reopened or targets another entity. The password is intentionally client-side and adds no authentication or backend architecture.
- The Books screen now offers an inventory export dialog with all unique subject names selected by default. Users may export every subject or any non-empty subset; export failures stay visible in the open dialog and a successful export downloads exactly once as `book-inventory-audit-<academic-year>.xlsx`.
- Book exports use one `Book Inventory` worksheet and one five-column table: Book, Grade, Quantity, Receipt date, and Receipt ID. Every qualifying receipt item is one row; the semester is a localized suffix on the book name, and grade uses the exact grade label such as `1st Primary` rather than the stage.
- Export rows include active selected books and positive, unreversed stock-receipt items whose receipt date is on or after the Cairo-local creation date of the current academic-year row. Subjects are not emitted as grouping rows. A single selected subject receives a subject-specific audit title; multiple subjects receive `Book Inventory Audit`.
- English and Arabic production-generated XLSX files were reopened from disk and rendered. Both preserved the unified table, quantities, dates/receipt IDs, exact grade labels, localized semester suffixes, landscape one-page-width print setup, and calculated print area. Arabic preserved RTL worksheet/cell direction. Formula-error scans returned no matches.
- Sequential final verification passed: legacy 18 files / 67 tests; React 30 passed files / 134 tests with one live-only test skipped; sync API 4 passed files / 27 tests with four live-gated tests skipped; shared 5 files / 26 tests; workspace lint/typecheck/build; and all five rendered Chromium journeys. This feature requires no database migration or credential change.

## Next Starting Point

1. Review and integrate branch `codex/protected-delete-book-export`, whose implementation commits are `7fc8d2f`, `c786b1e`, and `98ca70c` on top of the approved specification and plan.
2. No database migration or Neon operation is needed; the next release task begins with merge/rebase verification and version selection.
3. Preserve the offline-first global dataset and restricted `student_book_sync_client` transport. Keep owner database and management credentials out of the desktop.
