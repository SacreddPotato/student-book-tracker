# Hostless Direct Neon Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every installed desktop client synchronize automatically with one shared Neon database through a restricted bundled login, without authentication or a hosted API process.

**Architecture:** Preserve SQLite, the Rust-backed local transaction command, `SyncEngine`, and `SyncApiClient`. Add two `SECURITY DEFINER` PostgreSQL functions behind a login with no table access, then call them from the desktop through `@neondatabase/serverless` over HTTPS.

**Tech Stack:** React 19, TypeScript, Vite 8, Tauri 2, SQLite, Rust/sqlx, `@neondatabase/serverless`, PostgreSQL 17, Drizzle, Vitest, Playwright, GitHub Actions.

## Global Constraints

- All clients use one global school scope and require no login.
- The desktop may compile only the pooled `student_book_sync_client` URL.
- `DATABASE_URL`, `neondb_owner`, Neon management credentials, and `SYNC_API_SHARED_SECRET` remain outside desktop artifacts.
- The restricted login receives only `CONNECT`, `sync_api` `USAGE`, and `EXECUTE` on `sync_push(jsonb)` and `sync_pull(bigint)`.
- Local UI reads/writes remain SQLite-first through the existing Rust-backed transaction path.
- Placeholder data may be cleared once during the `v1.0.3` hostless cutover.
- Every production behavior follows test-first RED, GREEN, and REFACTOR cycles.
- Update `AGENTS.md` after each completed task with fresh evidence and the exact next starting point.
- Run legacy Svelte and React gates sequentially because both can touch generated frontend state.

---

### Task 1: Atomic PostgreSQL Push/Pull Contract

**Files:**
- Modify: `apps/sync-api/src/db/schema.ts`
- Create: `apps/sync-api/drizzle/0004_hostless_direct_neon_sync.sql`
- Create: `apps/sync-api/drizzle/meta/0004_snapshot.json`
- Modify: `apps/sync-api/drizzle/meta/_journal.json`
- Modify: `apps/sync-api/tests/schema.test.ts`
- Create: `apps/sync-api/tests/hostless-sync.integration.test.ts`
- Modify: `apps/sync-api/src/db/verify-migration.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: all nine `SyncCommand` discriminants and the current `sync_changes` payload shape.
- Produces: `sync_api.sync_push(p_commands jsonb) returns jsonb`, `sync_api.sync_pull(p_since bigint) returns jsonb`, and `applied_sync_commands`.

- [x] **Step 1: Write failing schema and SQL tests**

Add static assertions for `sync_api`, `sync_private`, `student_book_sync_runtime`, `applied_sync_commands`, both procedure signatures, `SECURITY DEFINER`, fixed `search_path`, revoked `PUBLIC` execution, and all nine discriminants. Add a real-Postgres suite enabled by `HOSTLESS_TEST_DATABASE_URL` with these call shapes:

```ts
const [row] = await sql`
  SELECT sync_api.sync_push(${JSON.stringify(commands)}::jsonb) AS payload
`;
const [pullRow] = await sql`
  SELECT sync_api.sync_pull(${since}::bigint) AS payload
`;
```

Cover accepted/rejected/replay behavior for every command, both deletion tombstones, pull pagination, stale rollover, wrong-grade issuance, insufficient stock, reversal, duplicate IDs, concurrent issue, and concurrent reversal.

- [x] **Step 2: Verify RED**

Run:

```powershell
npm run test -w @app/sync-api -- --run tests/schema.test.ts
```

Expected: FAIL because migration `0004` and `applied_sync_commands` do not exist.

- [x] **Step 3: Add the Drizzle table and migration metadata**

Add:

```ts
export const appliedSyncCommands = pgTable("applied_sync_commands", {
  commandId: text("command_id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull(),
  reasonCode: text("reason_code"),
  message: text("message"),
  appliedAt: text("applied_at").notNull(),
});
```

Add it to `requiredRemoteTableNames`, run `npm run db:generate -w @app/sync-api`, and require the tag `0004_hostless_direct_neon_sync`.

- [x] **Step 4: Implement the immutable SQL contract**

Migration `0004` must enable `pgcrypto`, create `sync_api` and `sync_private`, create `student_book_sync_runtime` as `NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT`, and clear placeholder remote rows before exposing functions.

Create private fixed-search-path validators and handlers for `INITIALIZE_ACADEMIC_YEAR`, `ADVANCE_ACADEMIC_YEAR`, `UPSERT_STUDENT`, `UPSERT_BOOK`, `DELETE_STUDENT`, `DELETE_BOOK`, `ADD_BOOK_STOCK`, `ISSUE_BOOKS_TO_STUDENT`, and `REVERSE_TRANSACTION`.

`sync_push` accepts only arrays of 1–100 commands, acquires `pg_advisory_xact_lock(hashtextextended(command_id, 0))`, compares a payload hash, locks mutable rows, records ordered `sync_changes` snapshots, and persists stable results. Business rejection stays inside its command subtransaction; unexpected SQL errors abort the batch. Accepted replay returns `duplicate`; rejected replay returns the original rejection.

`sync_pull` rejects negative cursors and returns at most 200 global rows ordered by sequence. Every definer function uses:

```sql
SET search_path = pg_catalog, public, sync_private
```

Change function ownership to `student_book_sync_runtime`, revoke `PUBLIC` execution, grant runtime only required `public`/`sync_private` schema usage plus table/sequence `SELECT/INSERT/UPDATE`, and grant no client login privileges. The migration temporarily grants its executing owner membership in the runtime role only as needed to transfer function ownership, then revokes that membership.

- [x] **Step 5: Rehearse and verify GREEN on disposable PostgreSQL 17**

Start a uniquely named PostgreSQL 17 container. Set `DATABASE_URL` and `HOSTLESS_TEST_DATABASE_URL` to it, apply the complete Drizzle history twice, then run:

```powershell
npm run test -w @app/sync-api -- --run tests/schema.test.ts tests/hostless-sync.integration.test.ts
npm run db:verify -w @app/sync-api
```

Expected: all cases pass; verifier reports five migrations, both functions, runtime ownership, grants, and zero cutover rows. Stop/remove only that container.

- [x] **Step 6: Update handoff and commit**

```powershell
git add apps/sync-api AGENTS.md
git commit -m "feat: add atomic hostless sync procedures"
```

---

### Task 2: Restricted Client-role Provisioning

**Files:**
- Create: `apps/sync-api/src/db/sync-role.ts`
- Create: `apps/sync-api/src/db/provision-sync-role.ts`
- Create: `apps/sync-api/tests/sync-role.test.ts`
- Modify: `apps/sync-api/package.json`
- Modify: `apps/sync-api/.env.example`
- Modify: `docs/runbooks/database-migrations.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: owner `DATABASE_URL`, fixed role `student_book_sync_client`, and migration `0004`.
- Produces: `provisionSyncRole({ ownerDatabaseUrl, password })` and `db:provision-sync-role`.

- [x] **Step 1: Write failing provisioning tests**

Assert exact role naming, pooled restricted URL construction, password redaction, distinct owner/restricted usernames, and grants limited to:

```sql
GRANT CONNECT ON DATABASE <database> TO student_book_sync_client;
GRANT USAGE ON SCHEMA sync_api TO student_book_sync_client;
GRANT EXECUTE ON FUNCTION sync_api.sync_push(jsonb) TO student_book_sync_client;
GRANT EXECUTE ON FUNCTION sync_api.sync_pull(bigint) TO student_book_sync_client;
```

The live test calls both functions as the restricted login and proves table reads/writes, `CREATE`, role creation, and `sync_private` execution fail.

- [x] **Step 2: Verify RED**

```powershell
npm run test -w @app/sync-api -- --run tests/sync-role.test.ts
```

Expected: FAIL because `sync-role.ts` is missing.

- [x] **Step 3: Implement provisioning**

Export:

```ts
export const syncClientRoleName = "student_book_sync_client";
export type ProvisioningReport = {
  ownerFingerprint: string;
  restrictedFingerprint: string;
  roleName: typeof syncClientRoleName;
  pushCallable: boolean;
  pullCallable: boolean;
  deniedChecks: string[];
};
```

The CLI requires `DATABASE_URL` and `NEON_SYNC_ROLE_PASSWORD`, never logs either, exits nonzero on privilege leakage, and prints only the report. URL construction replaces credentials, preserves host/database/TLS parameters, and requires a pooled Neon hostname.

- [x] **Step 4: Verify GREEN and commit**

```powershell
npm run test -w @app/sync-api -- --run tests/sync-role.test.ts
npm run db:provision-sync-role -w @app/sync-api
git add apps/sync-api docs/runbooks/database-migrations.md AGENTS.md
git commit -m "feat: provision restricted Neon sync role"
```

---

### Task 3: Direct Neon Desktop Transport and Release Configuration

**Files:**
- Modify: `apps/desktop-react/package.json`
- Modify: `package-lock.json`
- Modify: `apps/desktop-react/.env.example`
- Modify: `apps/desktop-react/src/app/runtime-config.ts`
- Modify: `apps/desktop-react/src/app/runtime-config.test.ts`
- Create: `apps/desktop-react/src/core/sync/neon-query.ts`
- Create: `apps/desktop-react/src/core/sync/neon-direct-client.ts`
- Create: `apps/desktop-react/src/core/sync/neon-direct-client.test.ts`
- Modify: `apps/desktop-react/src/core/sync/api-client.ts`
- Modify: `apps/desktop-react/src/core/sync/api-client.test.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.ts`
- Modify: `.github/workflows/release-windows.yml`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `VITE_NEON_SYNC_DATABASE_URL` and Task 1 results.
- Produces: `NeonDirectSyncClient`, `createNeonQuery(databaseUrl)`, and `RuntimeConfig.neonSyncDatabaseUrl`.

- [x] **Step 1: Write failing config/client/workflow tests**

Cover absent configuration, valid pooled URL, wrong protocol, non-Neon host, non-pooler endpoint, missing password/database, and any username other than `student_book_sync_client`. Errors redact passwords.

Inject:

```ts
export type NeonQuery = <T extends Record<string, unknown>>(
  text: string,
  parameters: readonly unknown[],
) => Promise<T[]>;
```

Assert push uses `SELECT sync_api.sync_push($1::jsonb) AS payload` and pull uses `SELECT sync_api.sync_pull($1::bigint) AS payload`. Reject malformed payloads. Assert release maps `secrets.NEON_SYNC_DATABASE_URL` only into `VITE_NEON_SYNC_DATABASE_URL`.

- [x] **Step 2: Verify RED**

```powershell
npm run test -w @app/desktop-react -- --run src/app/runtime-config.test.ts src/core/sync/api-client.test.ts src/core/sync/neon-direct-client.test.ts
```

Expected: FAIL because direct transport/config fields do not exist.

- [x] **Step 3: Implement transport and runtime wiring**

Pin `@neondatabase/serverless` to exact version `1.1.0` in both sync-api and desktop-react. Wrap `neon(databaseUrl).query(text, parameters)` behind `NeonQuery`. Implement:

```ts
export class NeonDirectSyncClient implements SyncApiClient {
  constructor(private readonly query: NeonQuery) {}
  push(commands: SyncCommand[]): Promise<SyncCommandResult[]>;
  pull(since: string | null): Promise<PullResponse>;
}
```

Parse full result shapes instead of casting. Keep `FetchSyncApiClient` only for preserved Hono tests. Runtime config accepts null or a pooled Neon URL with exact username `student_book_sync_client`. Build the client only after SQLite initialization. Remove desktop release use of `VITE_SYNC_API_BASE_URL` and `VITE_SYNC_API_SHARED_SECRET`.

- [x] **Step 4: Verify GREEN and commit**

```powershell
npm run test -w @app/desktop-react -- --run src/app/runtime-config.test.ts src/core/sync/api-client.test.ts src/core/sync/neon-direct-client.test.ts
npm run typecheck -w @app/desktop-react
npm run build -w @app/desktop-react
git add apps/desktop-react .github/workflows/release-windows.yml package-lock.json AGENTS.md
git commit -m "feat: connect desktop directly to Neon sync"
```

---

### Task 4: One-time Local Cutover and Bounded Push Batches

**Files:**
- Modify: `apps/desktop-react/src/core/db/migrations.ts`
- Modify: `apps/desktop-react/src/core/db/production-data-continuity.test.ts`
- Modify: `apps/desktop-react/src/core/db/repositories/outbox.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: v1.0.3 SQLite and `NeonDirectSyncClient`.
- Produces: `004_hostless_sync_cutover` and `listPendingOutboxRows(database, limit = 100)`.

- [ ] **Step 1: Write failing cutover and batching tests**

Seed a v1.0.3 database with all domain tables, pending/rejected outbox rows, a cursor, `sync.acknowledged-conflict-ids`, and an unrelated preference. Assert `004` clears domain/outbox/state/conflict acknowledgement, preserves the unrelated preference, runs once, and never clears a mutation created afterward.

Seed 101 pending commands. Assert one sync request pushes 100 then 1 and then pulls. Assert unexpected first-batch failure leaves every row pending.

- [ ] **Step 2: Verify RED**

```powershell
npm run test -w @app/desktop-react -- --run src/core/db/production-data-continuity.test.ts src/core/sync/sync-engine.test.ts
```

Expected: FAIL because migration `004` and bounded reads are absent.

- [ ] **Step 3: Implement cutover and batching**

Delete child/history rows before parent rows, then delete `sync_outbox`, `sync_state`, and only the conflict acknowledgement setting. Do not drop tables/indexes. Query pending rows with `ORDER BY created_at, id LIMIT $1`. Loop 100-command pushes until fewer than 100 remain and apply each response before reading again. Keep all local write batches in `runLocalTransaction`.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm run test -w @app/desktop-react -- --run src/core/db/production-data-continuity.test.ts src/core/sync/sync-engine.test.ts src/core/services/inventory-service.test.ts src/core/services/academic-year-service.test.ts
npm run typecheck -w @app/desktop-react
git add apps/desktop-react/src/core/db apps/desktop-react/src/core/sync AGENTS.md
git commit -m "feat: cut over local data to hostless sync"
```

---

### Task 5: Rotated Neon Migration and Two-client Live Proof

**Files:**
- Modify: `.github/workflows/migrate-production.yml`
- Modify: `apps/sync-api/src/db/verify-migration.ts`
- Create: `apps/sync-api/src/db/verify-hostless-sync.ts`
- Modify: `apps/sync-api/package.json`
- Modify: `docs/runbooks/database-migrations.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: rotated development/production owner URLs and out-of-repo restricted passwords.
- Produces: migrated targets, restricted pooled URLs, redacted fingerprints, and two-client convergence evidence.

- [ ] **Step 1: Write failing verifier/workflow tests**

Require five migration rows, exact functions/owners/grants, clean cutover counts, the restricted negative privilege matrix, and a production expected fingerprint supplied through a protected secret rather than the obsolete literal.

- [ ] **Step 2: Verify RED**

```powershell
npm run test -w @app/sync-api -- --run tests/schema.test.ts tests/sync-role.test.ts
npm run test -w @app/desktop-react -- --run src/app/runtime-config.test.ts
```

Expected: FAIL on the old migration count/fingerprint workflow.

- [ ] **Step 3: Implement redacted verification tooling**

Accept owner/restricted URLs only through environment variables. Hash hostname plus database path, assert owner/restricted roles differ, inspect catalog/grants/counts, and exercise push/pull without printing URLs. Make the production workflow fail closed when the rotated expected fingerprint secret is absent.

- [ ] **Step 4: Apply and verify development**

```powershell
npm run db:migrate -w @app/sync-api
npm run db:provision-sync-role -w @app/sync-api
npm run db:verify-hostless -w @app/sync-api
```

Use two temporary SQLite profiles to exchange year initialization, grade-scoped book, stock receipt, student, issuance, reversal, both soft deletions, and rollover. Disconnect one transport, queue a mutation, reconnect, and prove both cursors converge.

- [ ] **Step 5: Apply and verify production**

Update the production owner Secret and rotated expected fingerprint, dispatch the typed-confirmation migration workflow, provision production `student_book_sync_client`, store only its pooled URL as `NEON_SYNC_DATABASE_URL`, and run the hostless verifier. Stop if either target differs from the five-migration history.

- [ ] **Step 6: Verify packages and commit**

```powershell
npm run test -w @app/sync-api
npm run typecheck -w @app/sync-api
git add .github/workflows/migrate-production.yml apps/sync-api docs/runbooks/database-migrations.md AGENTS.md
git commit -m "ops: verify hostless Neon sync targets"
```

---

### Task 6: Production Installer Verification and Release

**Files:**
- Modify: `apps/desktop-react/package.json`
- Modify: `package-lock.json`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: verified production `NEON_SYNC_DATABASE_URL` and all prior commits.
- Produces: the next signed stable Windows release and updater metadata.

- [ ] **Step 1: Run complete gates sequentially**

```powershell
npm run test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test --manifest-path apps/desktop-react/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
```

Expected: zero failures.

- [ ] **Step 2: Smoke exact production profile offline**

Build with `VITE_NEON_SYNC_DATABASE_URL` absent. Launch a uniquely named copy, verify maximized Arabic rendering, create a local academic year/mutation, and confirm offline plus queued outbox behavior.

- [ ] **Step 3: Smoke exact production profile online**

Build with the verified restricted production URL. Verify sync without any Hono process, outbox drain, second-profile pull, and artifact scan absence of `neondb_owner`, the owner target fingerprint, and `SYNC_API_SHARED_SECRET`.

- [ ] **Step 4: Version, commit, integrate, and release**

Set the next stable patch version, commit the candidate, merge into main, wait for CI, tag the exact passing merge, and wait for signed Windows release publication. Download installer/signature/latest.json and verify hashes, ProductVersion/FileVersion, signatures, updater targets, and global `releases/latest`.

- [ ] **Step 5: Record final handoff**

Update `AGENTS.md` with exact test counts, merge/tag/workflow IDs, release URL, asset hashes, live redacted fingerprints, and next starting point. Commit/push the handoff without moving the release tag.
