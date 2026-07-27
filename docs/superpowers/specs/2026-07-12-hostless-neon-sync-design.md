# Hostless Direct Neon Sync Design

**Status:** Approved architecture; written specification awaiting user review

**Date:** 2026-07-13

**Baseline:** `v1.0.3` / merge `3a026687`

**Supersedes:** The earlier Neon Auth, Data API, RLS, membership, and reconciliation design in this file and the existing `docs/superpowers/plans/2026-07-12-hostless-neon-sync.md` plan.

## Objective

Make every installed Windows client synchronize automatically with one shared Neon database when the client has internet access. The client requires no login, deployed API server, always-on operator machine, or paid external host.

The React/Tauri app remains offline-first. SQLite is always the UI's source of truth, local mutations remain atomic and immediately usable, and the existing outbox/cursor engine continues retrying after connectivity returns.

The user explicitly accepts that a database credential compiled into the installer is extractable under this trusted-machine threat model. The compiled credential must nevertheless be a dedicated restricted login. The owner `DATABASE_URL`, `neondb_owner`, Neon management credentials, and `SYNC_API_SHARED_SECRET` remain outside the desktop and release artifact.

## Decisions

- All clients belong to one school and one global data scope.
- There is no user authentication, account UI, tenant membership, device approval, or per-user authorization.
- The desktop connects to Neon with `@neondatabase/serverless` over HTTPS.
- The desktop login may execute only `sync_api.sync_push(jsonb)` and `sync_api.sync_pull(bigint)`.
- PostgreSQL procedures own remote validation, locking, idempotency, mutation, and change recording.
- The hosted Hono API is not required at runtime. It remains buildable for tests, migration tooling, and rollback diagnostics.
- Placeholder local and remote data may be cleared during this one-time cutover.
- The intended release is the next stable version after `v1.0.3`.

## Official Platform Facts

- Neon's generally available JavaScript driver supports browsers and sends PostgreSQL queries over HTTP or WebSockets: <https://neon.com/docs/serverless/serverless-driver>.
- HTTP is intended for one-shot queries and non-interactive transactions. This design performs each push or pull with one SQL statement and keeps the complete mutation transaction inside the called PostgreSQL function.
- Neon recommends pooled connection strings for applications with numerous clients: <https://neon.com/docs/connect/connection-pooling>.

## Options Considered

### 1. Restricted direct Neon role plus stored procedures — selected

This gives the client the connectionless HTTP transport it needs while limiting the bundled login to two reviewed entry points. It preserves the current `SyncApiClient` boundary and keeps concurrency-sensitive business rules inside one PostgreSQL transaction.

### 2. Bundled owner connection string — rejected

This is marginally faster to wire but unnecessarily permits schema changes, role changes, arbitrary table access, and destructive operations. The dedicated role and grants add little operational cost.

### 3. Neon Data API, Neon Auth, and RLS — rejected

This provides per-user isolation that the product does not need. It adds account provisioning, tokens, memberships, scope binding, login UX, origin validation, and reconciliation paths without improving the confirmed single-school workflow.

## Architecture

```text
React UI
  -> SQLite repositories and Rust-backed local transactions
  -> sync_outbox and sync_state
  -> SyncEngine / CoalescingSyncRunner
  -> NeonDirectSyncClient
  -> @neondatabase/serverless HTTP query
  -> sync_api.sync_push / sync_api.sync_pull
  -> PostgreSQL domain tables and sync_changes
```

The `SyncApiClient` TypeScript interface remains:

```ts
type SyncApiClient = {
  push(commands: SyncCommand[]): Promise<SyncCommandResult[]>;
  pull(since: string | null): Promise<PullResponse>;
};
```

`FetchSyncApiClient` remains available only to the preserved Hono diagnostic path and its tests. `createTauriBackend` selects `NeonDirectSyncClient` when a restricted Neon URL is configured and otherwise constructs the existing unavailable client. No network operation may occur before SQLite opens and the application renders.

## Database Privilege Model

Migration `0004_hostless_direct_neon_sync.sql` creates:

- `sync_api`, containing only the two client-callable functions;
- `sync_private`, containing fixed-search-path helper functions for validation and command handlers;
- `applied_sync_commands`, keyed by command ID and storing the stable result for idempotent replay;
- a `student_book_sync_runtime` `NOLOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT` role;
- the push/pull functions with `SECURITY DEFINER`, owned by `student_book_sync_runtime` after that role receives only the required table and sequence `SELECT`/`INSERT`/`UPDATE` privileges.

The migration revokes default `PUBLIC` function execution. It grants no client role direct privileges on domain tables, `sync_changes`, `applied_sync_commands`, sequences, `sync_private`, or schema creation.

A separate idempotent provisioning command, run with the owner URL, creates or rotates `student_book_sync_client` as a login role. It grants only database `CONNECT`, `sync_api` `USAGE`, and `EXECUTE` on the exact push/pull signatures. It accepts the password through an environment variable or generates one in process memory, prints no credential, and verifies the role by proving:

- both sync functions execute;
- direct `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, and private helper execution fail;
- the role is not a member of the runtime or owner role.

The provisioning command produces the restricted pooled connection string only in a caller-designated untracked output or protected CI value. It never rewrites the owner `DATABASE_URL`.

## Remote Procedure Contract

### `sync_api.sync_push(p_commands jsonb) returns jsonb`

The desktop sends at most 100 commands per call. The function rejects a non-array, an empty array, an oversized batch, malformed command objects, unknown discriminants, invalid timestamps, invalid academic years, invalid grades, invalid semesters, and invalid quantities using existing `SyncCommandResult` reason codes.

The function processes commands in input order inside one transaction. Each command:

1. acquires a transaction-scoped advisory lock derived from its command ID;
2. returns the stored result when that ID already exists;
3. applies the same rules currently implemented by `apps/sync-api/src/services/apply-command.ts`;
4. locks current-year, book, and transaction rows before concurrency-sensitive checks;
5. writes domain changes and matching ordered `sync_changes` snapshots atomically;
6. records the accepted or rejected result in `applied_sync_commands`.

Expected business conflicts return `rejected` without aborting neighboring commands. Unexpected database errors abort the complete batch so the desktop leaves all affected outbox rows pending. Replaying an accepted command returns `duplicate`; replaying a rejected command returns the original stable rejection.

The SQL command union must cover all nine current discriminants:

- `INITIALIZE_ACADEMIC_YEAR`
- `ADVANCE_ACADEMIC_YEAR`
- `UPSERT_STUDENT`
- `UPSERT_BOOK`
- `DELETE_STUDENT`
- `DELETE_BOOK`
- `ADD_BOOK_STOCK`
- `ISSUE_BOOKS_TO_STUDENT`
- `REVERSE_TRANSACTION`

### `sync_api.sync_pull(p_since bigint) returns jsonb`

`p_since` must be a nonnegative safe cursor. The function returns at most 200 global-scope changes ordered by `sequence`:

```json
{
  "changes": [
    {
      "sequence": 1,
      "commandId": "command-id",
      "entityTable": "books",
      "entityId": "book-id",
      "payloadJson": "{...}",
      "createdAt": "2026-07-13T00:00:00.000Z"
    }
  ],
  "nextCursor": "1"
}
```

When no row follows the supplied cursor, `changes` is empty and `nextCursor` is the supplied cursor. The function exposes no scope parameter and cannot return non-global rows.

## Desktop Configuration

The desktop release accepts one new build value:

```text
VITE_NEON_SYNC_DATABASE_URL
```

GitHub Actions reads it from the protected `NEON_SYNC_DATABASE_URL` secret and maps it only into the Tauri build step. Although the bundled value is extractable by design, keeping it in a GitHub Secret avoids unnecessary repository/UI exposure.

Runtime validation requires:

- `postgresql:` or `postgres:`;
- a Neon hostname over TLS;
- the exact username `student_book_sync_client`, never `neondb_owner` or another migration role;
- a nonempty password and database name;
- a pooled endpoint for installed multi-client use.

A missing or blank value intentionally creates the unavailable client and preserves offline startup. A malformed or owner-role value is caught inside the asynchronous bootstrap boundary and produces the existing startup recovery UI rather than a blank page.

`VITE_SYNC_API_BASE_URL` and `VITE_SYNC_API_SHARED_SECRET` are removed from the desktop release build. `DATABASE_URL` remains the owner/migration variable for `apps/sync-api` only.

## Offline and Multi-client Data Flow

### Local mutation

1. A user action commits domain rows plus its outbox command through the existing Rust-backed SQLite transaction path.
2. The UI updates immediately from SQLite.
3. The coalescing runner requests sync without blocking the mutation result.

### Push

1. The engine reads at most 100 pending commands and normalizes reversal references.
2. `NeonDirectSyncClient` calls `sync_push` through one parameterized HTTP query.
3. Accepted/duplicate rows become `synced`; rejected rows retain their stable reason; unexpected transport/database failures remain pending.

### Pull

1. The engine calls `sync_pull` from the persisted cursor.
2. Each response is applied with the cursor in one Rust-backed local transaction.
3. Pull repeats until the server returns no changes or the cursor does not advance.

### Offline behavior

DNS failure, connection refusal, timeout, fetch failure, and a sleeping/unreachable Neon endpoint map to `offline`. Invalid compiled configuration maps to startup recovery. PostgreSQL authentication, privilege, malformed-response, or procedure failures map to `error` with a redacted message. No error or log includes a connection string or password.

The application remains fully usable from SQLite in all network states. Sync retries on startup, after local mutations, and through the existing manual/status-driven mechanism.

## One-time Cutover

The user has confirmed that all existing data is placeholder-only and may be removed or overwritten. To avoid merging incompatible offline histories, the hostless release uses one explicit sync epoch:

- the remote `0004` migration clears placeholder domain, outbox/state/settings, change-stream, and applied-command rows before installing the final procedures;
- local SQLite migration `004_hostless_sync_cutover` clears placeholder domain, outbox, sync-state, and domain settings once while preserving language/window preferences where present;
- the local cursor restarts at `0`;
- a clean remote catalog/count verification is required before either restricted release URL is built;
- after cutover, no automatic reset runs again.

This cutover is intentionally destructive and is limited to the transition from `v1.0.3` or earlier. New offline mutations created after the migration are normal outbox data and are never cleared by sync.

## Development and Production Migration Sequence

1. Preserve the rotated owner URLs only in ignored local environment files or GitHub Secrets.
2. Rehearse migrations `0000` through `0004` twice on disposable PostgreSQL 17.
3. Assert the destructive cutover, procedure signatures, ownership, grants, constraints, and nine-command behavior.
4. Apply the committed history to the rotated development Neon target and record only a redacted fingerprint.
5. Provision/rotate its restricted client role and run two-client integration tests.
6. Update the production migration workflow's target fingerprint for the rotated production URL.
7. Apply the same committed history intentionally to production and record only a redacted fingerprint.
8. Provision/rotate the production restricted client role, store its pooled URL as `NEON_SYNC_DATABASE_URL`, and run privilege plus read-only catalog checks.
9. Never print, commit, upload, or include an owner URL in desktop artifacts.

## Testing Strategy

### TypeScript unit and integration tests

- runtime config: absent, valid restricted pooled URL, malformed URL, wrong protocol, owner username, missing password, and redacted errors;
- direct client: exact parameterized function calls, result parsing, cursor parsing, malformed payload rejection, and no request when unconfigured;
- sync engine: 100-command batching, accepted/duplicate/rejected handling, unexpected failure preservation, pull pagination, and offline classification;
- local cutover: exact one-time reset, preserved preferences, cursor zero, and new post-cutover mutations retained;
- release workflow: required restricted secret mapping and rejection of owner/shared-secret mappings.

### SQL and migration tests

- complete migration history applies twice on disposable PostgreSQL 17;
- all nine command types have accepted, rejected, replay, and change-stream assertions where applicable;
- concurrent stock issue never produces negative inventory;
- concurrent reversal applies once;
- concurrent duplicate command mutates once;
- academic-year rollover remains exact-successor-only and atomically promotes eligible students;
- deleted students/books remain in historical payloads while active queries exclude them;
- pull order, limit, and cursor behavior are stable;
- restricted-role negative privilege matrix passes.

### Desktop release validation

- exact production-profile build with the Neon value absent renders maximized Arabic UI and supports local SQLite mutations offline;
- configured build boots without a Hono server and reaches `synced` using only client internet access;
- two clean SQLite profiles exchange a student, grade-scoped book, stock receipt, issuance, reversal, deletion, and academic-year advance through Neon;
- disconnect/reconnect preserves pending data and drains it after connectivity returns;
- installed executable contains no owner username, owner URL, shared server secret, or Neon management key;
- signed installer, updater signature, release metadata, and global updater feed are verified before publication.

## Rollback

Removing `NEON_SYNC_DATABASE_URL` from a build returns the app to local-only mode without removing SQLite functionality. A released client can also be disabled by rotating or revoking only `student_book_sync_client`; clients then show a redacted sync error and continue offline.

Database rollback is forward-only. Do not drop synchronized data or rewrite committed migration `0004`; correct procedure defects with migration `0005` or later. The preserved Hono API can be used only as an operator diagnostic path and is not a required client dependency.

## Non-goals

- user accounts or login UI;
- multiple schools or tenant isolation;
- per-device credentials or revocation;
- hiding the restricted credential from a determined reverse engineer;
- background Windows-service sync while the application is closed;
- replacing SQLite with a network-first database;
- removing the preserved Svelte frontend or Hono service.

## Required Release Gates

1. Owner and restricted URLs must be distinct, and the restricted privilege matrix must pass.
2. No desktop or workflow path may compile the owner URL or shared server secret.
3. SQL handlers must exhaustively cover the shared command discriminant union.
4. The exact migration history must pass disposable rehearsal and both rotated Neon targets.
5. Offline boot and local writes must pass with no sync value configured.
6. Two installed-client profiles must complete bidirectional sync without any hosted API process.
7. `AGENTS.md` must be updated after every completed implementation segment with current evidence and the exact next starting point.
