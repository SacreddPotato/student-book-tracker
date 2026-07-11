# AGENTS.md

## Handoff Rule

Update this file after every completed implementation segment. Keep current status, verification evidence, environment notes, and the exact next starting point accurate. Do not restore the historical segment-by-segment journal; Git contains that history.

## Product And Branch

- Branch: `pre-release`.
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
- Excel subject cells use exactly: blank, `Only the first semester issued`, `Only the 2nd semester issued`, or `Both semesters issued`.

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

Completed and committed on `pre-release`:

- Shared semester, academic-year, promotion, and sync contracts.
- Reset-capable local SQLite schema/migration and React repositories.
- Semester-aware entity/inventory services and academic-year rollover service.
- Postgres schema, Drizzle migrations, command validation/application, locking, and tests.
- React backend contract, fixture/SQLite backends, academic-year provider, sync pull, and semester conflict detail.
- React UI for semester stock receipts, subject disclosures, mixed-semester issuance, logs, read-only archives, initial year setup, typed rollover confirmation, and exact Excel states.
- Rendered rollover and inventory journeys.
- Automatic CI version/tag/release workflow and updated operator documentation.

Latest verification:

```text
npm run test -w @app/desktop-react       28 files / 73 tests passed
npm run test:e2e -w @app/desktop-react   5 Chromium journeys passed
npm run build -w @app/desktop-react      passed
npx vitest run src/app/runtime-config.test.ts  8 tests passed
```

## Next Starting Point

1. Validate workflow YAML and run the full repository gates.
2. With the user-designated production Neon URL currently in `apps/sync-api/.env`, run the committed migrations and inspect the resulting tables/columns without printing credentials.
3. Stop and ask the user to switch `apps/sync-api/.env` to the development Neon branch.
4. After the user confirms, migrate development, run the final full verification matrix, update this handoff, and finish the branch.
