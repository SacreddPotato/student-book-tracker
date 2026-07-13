# Hostless Neon Sync Design

**Date:** 2026-07-12

**Status:** Approved by the user through the Track B design brief

**Base commit:** `869582b35a52c64e833f494721d9d7e7bdbf5498`

**Release relationship:** Track A's grade/deletion work merges first and owns Drizzle migration `0003_grade_scoped_books`; this design starts remote schema work at `0004` or later and ships with Track A in one combined release.

## Objective

Make synchronization self-sufficient when only the Windows desktop and Neon are online. The desktop remains a local-first SQLite application. Neon supplies managed identity, an HTTPS data surface, durable command application, change history, and tenant isolation. No Hono deployment, personal computer, or other continuously running service is part of the normal path.

The architecture preserves the existing behavioral contract:

- every UI read and mutation uses local SQLite;
- each local mutation and its outbox row commit together;
- accepted and duplicate commands drain from the outbox;
- deterministic server rejections remain visible conflicts;
- a numeric pull cursor advances only in the same local transaction that applies pulled changes;
- missing configuration, missing login, expired authentication, and network loss never prevent local startup or local work.

## Current System Constraints

The React desktop already isolates transport behind `SyncApiClient.push(commands)` and `SyncApiClient.pull(since)`. `SyncEngine` owns outbox preparation, result application, pull application, cursor persistence, and conflict status. The current `FetchSyncApiClient` calls Hono `/sync/push` and `/sync/pull` with a shared header. The Hono service validates commands, applies each command transactionally through Drizzle, writes `sync_changes`, and pulls ordered changes from the hard-coded `global` scope.

This is a useful seam: the desktop sync engine and local repositories do not need to become remote-first. The normal transport can change without changing the local inventory services or UI data source.

## Official Platform Facts Used

The unstable Neon details in this design were checked against current official documentation on 2026-07-12:

- [Neon Data API overview](https://neon.com/docs/data-api/overview): the Data API is a managed, stateless, PostgREST-compatible HTTPS interface, integrates with Neon Auth, respects PostgreSQL RLS, is configured per branch, and is currently Beta.
- [Getting started with the Data API](https://neon.com/docs/data-api/get-started): each branch/database has its own endpoint; valid JWTs are required; the Data API derives `auth.user_id()` from the JWT `sub`; schema changes require a schema-cache refresh; the TypeScript SDK injects and refreshes auth tokens; RPC calls are supported.
- [Data API access control](https://neon.com/docs/data-api/access-control): authenticated JWT requests run as the `authenticated` PostgreSQL role; grants define reachable objects and RLS defines reachable rows; RLS enabled without a policy denies all access.
- [Managing the Data API](https://neon.com/docs/data-api/manage): exposed schemas and CORS origins are configurable; only one JWT provider is active; removing it invalidates existing tokens; configuration is branch-specific.
- [Neon Auth and Data API React guide](https://neon.com/guides/react-neon-auth-data-api): a React client can use Neon Auth and the Data API directly without a backend; the database connection string remains migration-only and must not be exposed to the frontend.
- [Neon TypeScript SDK reference](https://neon.com/docs/reference/javascript-sdk): `@neondatabase/neon-js` manages sessions, caches session tokens, refreshes expired tokens, injects authentication into Data API calls, and exposes `.rpc()`.
- [Neon Auth production checklist](https://neon.com/docs/auth/production-checklist): production must configure trusted domains, production email delivery and verification policy, and must not leave generic localhost access enabled.

The implementation must re-check these pages and the installed SDK API before coding because Data API and Neon Auth remain Beta.

## Options Considered

### 1. Neon Data API + Neon Auth + PostgreSQL RLS and RPCs — selected

The desktop embeds only public Auth and Data API HTTPS origins. A user signs in at runtime. The managed SDK supplies a short-lived JWT to PostgREST RPC calls. PostgreSQL derives `scope_id` from the JWT identity and applies commands under RLS.

Advantages:

- no application server or database connection credential in the desktop;
- managed HTTPS, authentication, token refresh, branch endpoints, and scale-to-zero behavior;
- business mutations remain atomic in PostgreSQL;
- RLS is enforced at the data boundary even if a client is modified;
- the current desktop push/pull interface remains intact.

Costs and risks:

- Neon Auth and the Data API are Beta;
- command validation/application moves to committed PostgreSQL functions and must stay in parity with the shared TypeScript command union;
- the Tauri production WebView origin must be proven compatible with Neon Auth trusted-origin and Data API CORS settings before release.

### 2. Direct Neon serverless driver with a restricted login role — rejected

This would compile a PostgreSQL connection string for a restricted role into the desktop and use the Neon serverless driver over HTTPS. RLS could reduce row access, but the login credential would still be extractable from the shipped bundle or process. Rotation would invalidate every installed client, the role would expose an arbitrary SQL surface rather than three reviewed operations, and user attribution would require an additional JWT-to-session mechanism. It offers no meaningful advantage over the Data API for this application.

### 3. Bundled owner connection string — prohibited

An owner URL or `neondb_owner` credential grants schema and data authority, can bypass intended application restrictions, is recoverable from every installer, cannot safely distinguish users, and turns one copied string into full database compromise. It directly violates the product security boundary and is not a fallback.

## Selected Architecture

```text
React/Tauri UI
  -> local SQLite repositories and services (always available)
  -> local sync_outbox and sync_state
  -> SyncEngine
  -> AuthTokenProvider (embedded Neon Auth or proven native JWT flow)
  -> NeonDataApiSyncClient (injects Bearer token per request)
       -> HTTPS POST /rpc/sync_identity
       -> HTTPS POST /rpc/sync_push
       -> HTTPS POST /rpc/sync_pull
  -> Neon Data API (only sync_api schema exposed)
  -> PostgreSQL grants + RLS + committed functions
  -> scope-isolated domain tables, applied commands, sync_changes
```

Only `sync_api` is an exposed Data API schema. Domain tables remain in `public`; `public` is not an exposed schema. The `anonymous` role receives no privileges. The `authenticated` role receives only the table privileges required by security-invoker functions plus `USAGE`/`EXECUTE` on reviewed function schemas. RLS remains the final row guard even though direct table endpoints are not exposed.

The normal desktop path uses RPCs only. It does not use PostgREST table CRUD. This prevents a modified client from bypassing inventory rules with direct updates while retaining PostgREST's authenticated, connectionless transport.

Authentication and transport are separate. Every supported identity adapter implements `AuthTokenProvider.getAccessToken({ forceRefresh })`. `NeonDataApiSyncClient` obtains that token immediately before each RPC, adds `Authorization: Bearer <token>`, retries exactly once with `forceRefresh: true` after a 401, and then reports authentication-required. Tokens never appear in observable account state, SQLite, logs, notices, or errors.

## Provisioning and Configuration

### One-time Neon prerequisites per branch

Development and production branches are provisioned independently, in this binding order:

0. Merge Track A into `main`, merge/rebase that updated `main` into the implementation branch, and verify `0003_grade_scoped_books` plus the final command union.
1. Rotate the previously exposed owner credential immediately. Verify the old credential is rejected and the replacement can make a read-only connection; record only redacted target fingerprints. No owner URL, Neon Auth, Data API, schema-cache, branch-user, or other Neon operation may occur before this verification.
2. Run the self-contained desktop-auth origin spike below against a disposable audited probe branch/schema.
3. Apply the complete Drizzle migration history through the rotated owner `DATABASE_URL` from an untracked environment. The owner URL is used only by migration, reconciliation, and catalog-inspection tooling.
4. Enable the selected JWT identity provider and Data API for the branch/database.
5. Configure the Data API to expose only `sync_api`, use the selected authenticated JWT role, allow only the exact preview and production Tauri WebView origins, and set a finite maximum response row count of at least 200.
6. Refresh the Data API schema cache after migrations `0004`, `0005`, and `0006` are applied.
7. Create each school scope and add an explicit membership row for each application or diagnostic service user. Self-signup never creates a membership and therefore never grants data access.
8. Run the Data API Advisors and the repository's branch integration suite before that endpoint is eligible for release.

### Mandatory desktop-auth origin spike

After credential rotation, the spike pins and installs the candidate identity SDK before using it. It creates a disposable branch or database, enables the candidate identity provider and Data API, and applies an audited, temporary `auth_probe` schema containing only `auth_probe.whoami()`. That security-invoker RPC returns `auth.user_id()` and requires no application migration, membership table, or future `sync_identity` function. Only `auth_probe` is exposed for the probe. The probe branch/schema is deleted after evidence is captured.

The spike then builds a minimal production-profile Tauri executable and records its actual origin. The expected Windows origin is `http://tauri.localhost` unless checked-in configuration and runtime evidence prove otherwise. With generic **Allow Localhost** disabled, the probe must complete sign-in, an authenticated `auth_probe.whoami` call, process restart with session restoration, forced token refresh, sign out, and every redirect intended for production.

The result is committed to `docs/runbooks/neon-desktop-auth-spike.md`, including the exact SDK version and cleanup evidence. If Neon Auth accepts the exact origin and lifecycle, the selected mode is `embedded-neon`. If not, the same disposable probe must prove either a system-browser authorization-code-with-PKCE/loopback flow or a device-authorization flow from an identity provider whose JWKS is configured on the Data API. The native flow must use a public client, no bundled client secret, and a stable JWT `sub`. Failing both embedded and native-safe paths blocks implementation and release.

### Configuration names

All release-compiled values are public. Common values are `VITE_SYNC_AUTH_MODE` (`embedded-neon`, `native-pkce`, or `device-code`) and `VITE_NEON_DATA_API_URL`. Embedded Neon adds `VITE_NEON_AUTH_URL`. Native modes instead require `VITE_SYNC_AUTH_ISSUER`, `VITE_SYNC_AUTH_CLIENT_ID`, `VITE_SYNC_AUTH_AUDIENCE`, and `VITE_SYNC_AUTH_REDIRECT_URI`; audience may be an explicitly empty public string only when the selected provider documents that behavior. GitHub repository Variables use the same names without `VITE_`.

Runtime configuration is a discriminated union, so a native build cannot silently construct an email/password adapter and an embedded build cannot omit its Neon Auth URL. Missing mode plus missing endpoints intentionally creates the unavailable/offline client. Partial, malformed, credential-bearing, non-HTTPS, or mode-inconsistent values are caught configuration errors. No mode includes a client secret.

The production app never receives `DATABASE_URL`, `neondb_owner`, a Neon management API key, a JWT signing secret, `SYNC_API_SHARED_SECRET`, user email/password, or a session/access/refresh token as build configuration. `apps/sync-api` keeps `SYNC_API_SHARED_SECRET` only as its inbound diagnostic-route guard; it authenticates outbound through a dedicated runtime service account and does not use `DATABASE_URL` or owner bypass during diagnostic requests.

## Identity, Membership, and Scope Derivation

Remote schema additions:

- `sync_scopes(id text primary key, name text not null, created_at text not null)`
- `sync_scope_memberships(user_id text primary key, scope_id text not null, role text not null, created_at text not null, revoked_at text null)`
- `applied_sync_commands(scope_id text not null, command_id text not null, applied_at text not null, primary key(scope_id, command_id))`

The first release intentionally permits one active school scope per Auth user. `user_id` is the membership primary key. Multi-school account switching is not inferred or trusted from a request; it requires a future explicit product design.

`sync_private.current_scope_id()` reads the caller's own membership using `auth.user_id()`. If the JWT is missing, the user has no active membership, or a membership is revoked, every public RPC fails with an authorization error. No sync command or pull request accepts `scope_id`. PostgreSQL writes the derived value into every affected row and every change payload.

Membership rows are managed only by owner/operator tooling. The `authenticated` role can select its own membership under RLS and cannot insert, update, or delete memberships or scopes.

## Remote Schema and RLS

Hostless database work is split into immutable migrations created only after Track A's `0003` lands:

- `0004_hostless_neon_scope_rls.sql`: schemas, scope/membership/applied-command tables, final scoped keys, grants, forced RLS, and private helpers;
- `0005_hostless_neon_identity_pull.sql`: `sync_identity` and `sync_pull`;
- `0006_hostless_neon_push.sql`: private command handlers and `sync_push`.

Each migration is completed, tested, and committed once. Later tasks never edit a committed migration; corrections use the next migration number. The series must account for Track A's final grade-scoped book model and deletion commands.

Migration `0004` performs these changes:

- creates `sync_api` and `sync_private` schemas;
- creates scopes, memberships, and applied-command tables;
- adds `scope_id` to `academic_years`, `inventory_transaction_items`, and any Track A tables that do not yet carry it;
- changes academic-year identity to `(scope_id, academic_year)`;
- changes command uniqueness to `(scope_id, command_id)`;
- adds composite uniqueness and foreign keys such as `(scope_id, book_id)`, `(scope_id, student_id)`, and `(scope_id, transaction_id)` so a row cannot reference another scope even if application code is wrong;
- adds `(scope_id, sequence)` on `sync_changes` for cursor pulls;
- enables and forces RLS on every remotely synchronized domain table, `sync_changes`, and `applied_sync_commands`;
- gives `authenticated` the minimum `SELECT`/`INSERT`/`UPDATE` privileges required by the RPC implementation, with no hard deletes;
- gives `anonymous` no privileges and revokes default public function execution;
- grants `authenticated` only the reviewed RPC entry points introduced by later migrations and required private helpers;
- backfills legacy rows to the explicit `global` scope but creates no user membership automatically.

The common domain policy is:

```sql
USING (scope_id = sync_private.current_scope_id())
WITH CHECK (scope_id = sync_private.current_scope_id())
```

Membership self-read uses `user_id = auth.user_id()` directly. The implementation uses security-invoker functions so the caller remains `authenticated` and RLS applies normally. If an implementation constraint requires a security-definer helper, it must be owned by a dedicated `NOLOGIN`, non-`BYPASSRLS` role, use a fixed `search_path`, and have an integration test proving cross-scope denial. It must never be owned by or run as `neondb_owner` for client requests.

## RPC Contract

### `sync_identity()`

Returns exactly one object:

```json
{
  "userId": "auth-subject",
  "scopeId": "school-scope",
  "scopeName": "School name",
  "role": "owner",
  "remoteChangeCount": 0,
  "remoteMaxCursor": "0"
}
```

It derives the user and scope inside PostgreSQL. Remote count/cursor metadata is used only by the local upgrade/reconciliation gate; it does not authorize cursor retention. The function is called after sign-in and before a sync transport becomes eligible.

### `sync_push(p_commands jsonb)`

Accepts a non-empty JSON array of at most 100 commands from the final shared `SyncCommand` union. It returns the existing `SyncCommandResult[]` shape in input order. Each command has one of:

- `accepted`: validation passed, all domain writes, the applied-command receipt, and all change rows committed;
- `duplicate`: `(derived_scope_id, command.id)` already exists; no domain writes occur;
- `rejected`: a deterministic product rule failed; the command's subtransaction writes nothing and includes an existing reason code and user-facing message.

The function acquires a transaction advisory lock keyed by derived scope before processing the batch. This intentionally serializes command application within one school for the MVP. It also locks affected book, student, academic-year, and transaction rows in deterministic identifier order. Different scopes remain independent.

Each command executes inside a PL/pgSQL exception block, which creates a subtransaction. Business-rule failures are converted to `rejected` results. Unexpected database or programming errors are re-raised and roll back the entire RPC, so the desktop retains every affected outbox row as pending and can retry safely.

The applied-command receipt is inserted before domain mutation inside the same subtransaction. `ON CONFLICT DO NOTHING` distinguishes duplicates. A later rejection or unexpected error rolls the receipt back with the command. Every accepted command records the same entity snapshots and ordering dependencies currently consumed by `SyncEngine`, extended for Track A's final command types.

### `sync_pull(p_since bigint)`

Validates `p_since >= 0`, derives scope, and returns at most 200 ordered rows from `sync_changes` where `scope_id` matches and `sequence > p_since`:

```json
{
  "changes": [
    {
      "sequence": 42,
      "commandId": "command-id",
      "entityTable": "books",
      "entityId": "book-id",
      "payloadJson": "{...}",
      "createdAt": "2026-07-12T12:00:00.000Z"
    }
  ],
  "nextCursor": "42"
}
```

If no row is returned, `nextCursor` equals the supplied cursor. The global `bigserial` can contain gaps from other scopes; the `(scope_id, sequence)` index keeps pulls efficient and gaps do not change correctness.

## Desktop Data Flow

### Startup and session

1. Bootstrap resolves runtime configuration inside the existing caught asynchronous path.
2. SQLite opens and migrates before any network dependency is awaited.
3. The workspace renders from SQLite in every auth/network state.
4. When configuration is complete, the selected adapter restores its runtime session and implements `AuthTokenProvider.getAccessToken({ forceRefresh })`. Tokens remain inside the adapter's runtime/secure session store; they are never copied into observable account state, SQLite, `app_settings`, logs, notices, crash text, or release configuration.
5. The app calls `sync_identity`. If offline, local work continues and sync reports offline. If signed out, local work continues and sync reports authentication required.

Local SQLite migration `003_remote_scope_cursor` adds `remote_scope_id` beside `pull_cursor` in `sync_state`, plus `remote_scope_name` and `reconciled_at`. Scope and cursor are always updated atomically. The app never retains a legacy cursor merely because the new identity says `global`.

### SQLite/outbox/cursor upgrade matrix

| Local state | Remote scope | Required action |
|---|---|---|
| Pristine: no domain rows, no outbox rows, no cursor | Empty or nonempty | Bind `remote_scope_id`, set cursor to `0`, and pull full history. |
| Nonempty local, any pending/synced outbox, no prior verified scope | Empty | Block normal sync and run the owner-side `reconcile-local-sqlite` import against the closed SQLite file. The import atomically seeds the empty remote scope, records every imported outbox command ID as applied, emits a complete change stream, then writes returned scope/cursor locally. It is idempotent after a crash. |
| Nonempty local with drained or pending outbox and legacy cursor | Migrated `global` scope | Retain the cursor only after `reconcile-local-sqlite --mode verify-continuity` proves the local synced command IDs and cursor exist in that exact remote scope. The tool writes scope and reconciliation receipt atomically; otherwise sync stays blocked. |
| Nonempty local without verified continuity | Nonempty remote scope | Do not merge automatically and do not reset the cursor. Require an operator snapshot/import reconciliation into an empty scope or a verified-equivalent continuity run. |
| Any bound local state | Different authenticated scope | Report `scope-mismatch`; never push, pull, reset, import, or overwrite binding. |
| Rejected outbox conflicts | Any compatible scope | Preserve rejected status and acknowledgements; reconciliation never converts a rejection to accepted. |

The owner-side reconciliation tool lives in `apps/sync-api` and is never bundled. It requires the rotated owner URL and an explicit closed SQLite path, uses a remote transaction plus a durable reconciliation receipt, prints only redacted fingerprints/counts, and can be rerun safely. Until reconciliation passes, the desktop stays fully usable offline but sync reports `reconciliation-required`.

### Login UX

Settings gains a Sync Account card and Sync Status gains a navigation action:

- unconfigured: explains that the release has no sync transport and remains offline-capable;
- signed out with `embedded-neon` capability: email/password form with `rememberMe: true`, no public scope selector, and no production self-enrollment;
- signed out with `native-pkce` capability: one **Sign in in browser** action and no password fields;
- signed out with `device-code` capability: one **Get device code** action, verification URL/code display, and no password fields;
- resolving identity: busy state;
- membership missing/revoked: signed-in account shown with an operator-contact message and no sync;
- link required: shows the resolved school and an explicit confirmation;
- connected: shows account email, school name, last sync, manual sync, and sign out;
- offline with cached/local binding: shows the last bound school and that local work will queue;
- scope mismatch: shows both school names, blocks sync, and offers sign out only.

Provisioning creates Auth users and membership rows out-of-band. A successfully authenticated but unassigned user receives no data because both grants and RLS deny useful access.

### Push

1. A local inventory/entity/year/deletion mutation commits its SQLite changes and outbox row exactly as today.
2. `CoalescingSyncRunner` schedules `SyncEngine.sync()`.
3. The client requires a valid session, resolves `sync_identity`, and passes the scope-binding guard.
4. The engine reads at most 100 pending rows, parses and normalizes commands, and calls `sync_push`.
5. It marks accepted/duplicate rows synced and rejected rows rejected in one local transaction.
6. It repeats batches until no pending row remains, then pulls.
7. A 401 becomes authentication-required; transport failures become offline; a scope mismatch is a distinct non-retryable sync phase; unexpected RPC errors leave commands pending.

### Pull

1. The engine reads `sync_state.pull_cursor`, defaulting to `0` remotely while retaining the local nullable representation.
2. It calls `sync_pull` through the authenticated client.
3. It applies ordered snapshots using the existing dependency order and Track A's new entity/deletion handling.
4. It commits snapshots, `nextCursor`, `lastSyncedAt`, and a cleared error in one SQLite transaction.
5. It repeats until no changes arrive or the cursor does not advance.

## Rollback and Diagnostic Service

`apps/sync-api` remains buildable and tested but is removed from normal desktop startup and release configuration. Its Hono routes keep the inbound `SYNC_API_SHARED_SECRET` guard, then authenticate outbound to the Data API as one dedicated identity-provider service account. That account has one non-revoked membership with role `diagnostic`; RLS derives its scope from JWT `sub` exactly as for desktop users. The service stores its Auth URL, Data API URL, account identifier, and account credential/refresh material only in server secrets.

The diagnostic adapter calls the same public `sync_identity`, `sync_push`, and `sync_pull` RPCs through `AuthTokenProvider`. It has no `DATABASE_URL` at runtime, no owner/BYPASSRLS role, no scope parameter or `SYNC_API_SCOPE_ID`, and no private scope-explicit wrapper. A deployment serves exactly the service account's one scope. Negative tests prove it cannot read or mutate a second scope. Restoring a hosted multi-scope service would require a separate authenticated design.

Application rollback is configuration-first: remove both public Neon Variables or release the previous offline-safe client. The app immediately returns to local-only operation while outbox rows remain queued. Database rollback is forward-only: leave `0004` schema, RLS, and functions in place rather than dropping security objects or data. If a function defect exists, deploy a later corrective migration. Neon branch restore is an operator disaster-recovery tool, not the normal rollback mechanism.

## Migration and Release Sequence

0. Track A merges first into `main`; merge/rebase updated `main` into Track B and verify `0003_grade_scoped_books` plus the final shared command union.
1. Rotate and verify the owner credential before any other Neon or owner-URL operation. Preserve redacted evidence that the old credential fails and the replacement performs a read-only probe.
2. Execute and clean up the self-contained disposable origin/auth probe. Pin the selected identity SDK/provider and block desktop integration until the embedded or native-safe path passes.
3. Create and commit immutable migrations `0004` scope/RLS, `0005` identity/pull, and `0006` push. Never edit a committed migration.
4. Rehearse `0000` through `0006` on disposable PostgreSQL 17, including catalog/RLS/grant assertions and exhaustive SQL command cases.
5. Apply through `0006` to the development Neon branch, provision identity/Data API, refresh schema cache, create two users in two scopes, and pass integration tests.
6. Reconcile every nonempty legacy SQLite database through verified continuity or explicit empty-scope import before enabling normal sync.
7. Merge Track B after combined grade/deletion plus hostless tests pass. Do not publish either branch independently; they form one combined release candidate.
8. Apply the same migration history intentionally to production Neon, provision production identity/Data API and memberships, refresh cache, and run read-only catalog plus two-scope smoke checks.
9. Set only the public Variables required by the selected auth-mode discriminant.
10. Build the exact production-profile executable, prove offline boot with auth configuration absent, then prove login/push/pull/reconciliation/offline restart with the configured build.
11. Publish the signed combined release only after the global updater feed and installer checks pass.

## Testing Strategy

### Local and mock contract tests

- runtime configuration: unconfigured, embedded Neon, native PKCE, and device-code discriminants; required issuer/client/audience/redirect values; malformed, credential-bearing, mode-inconsistent, and production offline cases;
- auth controller: capability-specific sign-in, cached signed-in session, signed-out, offline refresh, invalid credentials, sign out, missing membership, reconciliation required, and scope mismatch;
- token provider/RPC client: `getAccessToken({ forceRefresh })`, exact Authorization injection, one forced-refresh retry after 401, exact RPC names/arguments, malformed payload rejection, and no request when unconfigured;
- SyncEngine: 100-command batching, accepted/duplicate/rejected status, pending preservation on unexpected RPC error, auth-required phase, scope mismatch, and cursor loops;
- local upgrade: every SQLite/outbox/cursor matrix row, atomic scope-plus-cursor persistence, blocked nonempty unverified state, idempotent empty-scope import receipt, and verified legacy-global cursor retention;
- rendered Settings and Sync Status journeys in Arabic and English;
- a fake PostgREST RPC contract driven by one exhaustive `Record<SyncCommand["type"], HandlerDescriptor>`; no separately maintained literal manifest.

### Migration and SQL tests

- immutable `0004`, `0005`, and `0006` follow `0003` in the Drizzle journal; later tasks never mutate an earlier committed migration;
- all synchronized tables have `relrowsecurity` and `relforcerowsecurity` enabled;
- anonymous has no table/function access;
- authenticated has no membership mutation privilege and cannot reach domain tables through the exposed schema;
- all cross-scope foreign keys and uniqueness constraints exist;
- the only exposed callable entry points are `sync_identity`, `sync_push`, and `sync_pull`;
- deterministic rejection rolls back that command while other valid commands in the batch commit;
- unexpected errors roll back the entire RPC;
- concurrent duplicate commands mutate once and return accepted/duplicate;
- concurrent issue commands cannot drive stock below zero;
- grade/deletion behavior from Track A emits and pulls the expected snapshots;
- an exhaustive `Record<SyncCommand["type"], SqlContractCase>` executes at least one accepted SQL case for every runtime discriminant and fails TypeScript compilation when the union grows.

### Neon branch integration tests

A protected integration orchestrator creates a disposable Neon child branch. Its exact CI/server-only inputs are `NEON_TEST_API_KEY`, `NEON_TEST_PROJECT_ID`, `NEON_TEST_PARENT_BRANCH_ID`, `NEON_TEST_DATABASE_NAME`, and `NEON_TEST_ROLE_NAME`. It obtains the child owner URL and public Auth/Data API URLs at runtime, never exports the owner URL to desktop build steps, creates random in-memory test passwords, and redacts credentials/tokens. In a `finally` block it deletes the child branch; branch deletion removes the temporary Auth/Data API configuration, users, memberships, and test rows. A cleanup failure fails the job and prints only project/branch IDs.

The disposable branch test uses two users assigned to different scopes and proves:

- each user resolves only its membership;
- user A cannot pull, identify, update, or reference user B rows;
- a tampered payload cannot choose a scope;
- every final command type is accepted or deterministically rejected as expected;
- duplicates are idempotent across two concurrent clients;
- pull cursors are ordered and scope-filtered;
- an expired/invalid token returns 401 and never changes data;
- schema-cache refresh exposes the three functions after migration;
- disabling/removing desktop transport leaves SQLite startup and mutations functional.

Owner URLs and Neon management keys exist only in local untracked files or protected CI environment secrets. Test account passwords exist only in process memory. Test output redacts tokens, URLs with credentials, and user passwords.

### Release-workflow parser test

`apps/desktop-react/tests/release-workflow-config.test.ts` reads `.github/workflows/release-windows.yml` as text. It asserts the selected auth-mode public mappings and `VITE_NEON_DATA_API_URL`, and rejects `DATABASE_URL`, `SYNC_API_SHARED_SECRET`, `NEON_TEST_API_KEY`, `NEON_API_KEY`, JWT signing-secret names, and diagnostic account secrets anywhere in the Tauri build step. The implementation plan runs this named test once before the workflow edit to prove RED and once after to prove GREEN.

## Observability and Error Handling

The desktop persists only safe error categories/messages in `sync_state.last_error`. It never stores response headers or raw tokens. User-visible categories are configuration unavailable, authentication required, membership unavailable, scope mismatch, offline, deterministic rejection, and unexpected sync error.

PostgreSQL rejected results use the existing stable reason codes. Authorization failures are transport-level and never converted into command conflicts. Unexpected SQL errors abort the request so the outbox stays pending. The release runbook records Data API branch identifiers and redacted endpoint fingerprints, migration rows, schema-cache refresh time, RLS/catalog checks, and integration test evidence.

## Non-goals

- replacing SQLite with remote reads;
- real-time subscriptions or push notifications;
- multi-school selection for one user;
- embedding any database or management credential;
- exposing generic CRUD endpoints;
- public self-enrollment into a school scope;
- deleting `apps/sync-api` or the Svelte rollback frontend;
- releasing Track A independently from this combined release.

## Risks and Required Gates

1. **Credential boundary:** Task 0 rotates and verifies the owner credential immediately after Track A integration. Every other Neon/owner-URL operation depends on that evidence.
2. **Beta platform surface:** the self-contained origin spike pins the candidate identity SDK, revalidates official docs, and uses only a disposable audited probe surface.
3. **Tauri WebView origin:** Task 2 owns the production-origin spike for `http://tauri.localhost` (unless runtime evidence differs) and must prove either embedded Neon Auth or a native device-code/external-browser JWT flow before implementation proceeds. Generic localhost access is not an acceptable workaround.
4. **SQL/TypeScript parity:** one exhaustive runtime descriptor record and one exhaustive SQL-case record must cover every final shared command type; a missing case is a compile/test failure.
5. **RLS mistakes:** catalog assertions, two-user negative tests, service-account cross-scope denial, Data API Advisors, and public-schema exclusion are mandatory.
6. **Local continuity:** nonempty SQLite never resets or retains a cursor by assumption. It stays offline until verified continuity or explicit empty-scope import succeeds.
7. **Migration immutability:** Track A owns `0003`; Track B commits `0004`, `0005`, and `0006` once each and fixes defects only with a later migration.
