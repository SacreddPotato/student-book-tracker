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
  -> NeonDataApiSyncClient
       -> Neon Auth runtime session
       -> HTTPS POST /rpc/sync_identity
       -> HTTPS POST /rpc/sync_push
       -> HTTPS POST /rpc/sync_pull
  -> Neon Data API (only sync_api schema exposed)
  -> PostgreSQL grants + RLS + committed functions
  -> scope-isolated domain tables, applied commands, sync_changes
```

Only `sync_api` is an exposed Data API schema. Domain tables remain in `public`; `public` is not an exposed schema. The `anonymous` role receives no privileges. The `authenticated` role receives only the table privileges required by security-invoker functions plus `USAGE`/`EXECUTE` on reviewed function schemas. RLS remains the final row guard even though direct table endpoints are not exposed.

The normal desktop path uses RPCs only. It does not use PostgREST table CRUD. This prevents a modified client from bypassing inventory rules with direct updates while retaining PostgREST's authenticated, connectionless transport.

## Provisioning and Configuration

### One-time Neon prerequisites per branch

Development and production branches are provisioned independently:

1. Rotate the previously exposed Neon database credential before any online-sync work.
2. Merge Track A into `main`, then merge or rebase updated `main` into the sync implementation branch. Confirm `0003_grade_scoped_books` is present and reserve `0004_hostless_neon_sync.sql` (or a later number if main advanced).
3. Apply the complete Drizzle migration history through the owner `DATABASE_URL` from an untracked environment. The owner URL is used only by migration and catalog-inspection tooling.
4. Enable Neon Auth for the branch/database.
5. Enable the Data API with Neon Auth as its JWT provider.
6. Configure the Data API to expose only `sync_api`, use the default `authenticated` JWT role, allow only the exact preview and production Tauri WebView origins, and set a finite maximum response row count of at least 200.
7. Refresh the Data API schema cache after migration.
8. Create each school scope and add an explicit membership row for each Neon Auth user. Self-signup never creates a membership and therefore never grants data access.
9. Run the Data API Advisors and the repository's branch integration suite before that endpoint is eligible for release.

### Mandatory desktop-auth origin spike

Before implementation commits depend on Neon Auth, build a minimal production-profile Tauri probe and record its actual origin. The expected Windows origin is `http://tauri.localhost` unless the checked-in Tauri configuration and runtime probe prove otherwise. Against the non-production Neon branch, the probe must complete email/password sign-in, an authenticated Data API RPC, process restart with session restoration, token refresh, sign out, and any redirect flow intended for production. Generic **Allow Localhost** is disabled during the proof; only the exact origin is trusted/allowed.

The result is committed to `docs/runbooks/neon-desktop-auth-spike.md`. If Neon Auth accepts the exact origin and session lifecycle, implementation continues with `@neondatabase/neon-js`. If it does not, the spike must prove one native-safe fallback before implementation continues: a system-browser authorization-code-with-PKCE/loopback flow or a device-authorization flow from an identity provider whose JWKS can be configured on the Neon Data API. Neon Auth may remain the provider only if its current official documentation supports that native flow; otherwise use an external JWT provider permitted by this design. The fallback must keep tokens in runtime/secure session storage, preserve `sub`-based RLS, and require no bundled client secret. Failing both embedded and native-safe paths blocks implementation and release.

### Configuration names

The only release-compiled sync values are public origins:

- `VITE_NEON_AUTH_URL`
- `VITE_NEON_DATA_API_URL`

GitHub repository Variables are named:

- `NEON_AUTH_URL`
- `NEON_DATA_API_URL`

The Windows release workflow maps those Variables to the two `VITE_*` values. Both must be absent or both must be non-empty HTTPS origins. Missing values intentionally create the unavailable/offline sync client. A partial pair or malformed/non-HTTPS value is a caught startup configuration error. The production app never receives `DATABASE_URL`, `neondb_owner`, a Neon management API key, a JWT signing secret, `SYNC_API_SHARED_SECRET`, user email/password, or a session token as build configuration.

`apps/sync-api` keeps its server-only `DATABASE_URL` and `SYNC_API_SHARED_SECRET` for explicit operator diagnostics. It is not started by `npm run dev:desktop` and is not selected by `createTauriBackend`.

## Identity, Membership, and Scope Derivation

Remote schema additions:

- `sync_scopes(id text primary key, name text not null, created_at text not null)`
- `sync_scope_memberships(user_id text primary key, scope_id text not null, role text not null, created_at text not null, revoked_at text null)`
- `applied_sync_commands(scope_id text not null, command_id text not null, applied_at text not null, primary key(scope_id, command_id))`

The first release intentionally permits one active school scope per Auth user. `user_id` is the membership primary key. Multi-school account switching is not inferred or trusted from a request; it requires a future explicit product design.

`sync_private.current_scope_id()` reads the caller's own membership using `auth.user_id()`. If the JWT is missing, the user has no active membership, or a membership is revoked, every public RPC fails with an authorization error. No sync command or pull request accepts `scope_id`. PostgreSQL writes the derived value into every affected row and every change payload.

Membership rows are managed only by owner/operator tooling. The `authenticated` role can select its own membership under RLS and cannot insert, update, or delete memberships or scopes.

## Remote Schema and RLS

Migration `0004_hostless_neon_sync.sql` is created only after Track A's `0003` has landed. It must account for the final grade-scoped book model and deletion command set from Track A.

The migration performs these changes:

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
- grants `authenticated` only the reviewed RPC entry points and required private helpers;
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
  "role": "owner"
}
```

It derives the user and scope inside PostgreSQL. It is called after sign-in and before a sync transport becomes eligible.

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
4. When both public origins exist, `@neondatabase/neon-js` restores its cached runtime session and refreshes it when online. Tokens remain in the SDK/WebView session store; they are never copied into SQLite, `app_settings`, logs, notices, crash text, or release configuration.
5. The app calls `sync_identity`. If offline, local work continues and sync reports offline. If signed out, local work continues and sync reports authentication required.

The app stores only a non-secret local binding in `app_settings`:

```json
{
  "scopeId": "school-scope",
  "scopeName": "School name",
  "boundAt": "2026-07-12T12:00:00.000Z"
}
```

An empty local database can bind automatically after the first authenticated identity call. A database containing domain rows or outbox commands requires an explicit **Link this device data** confirmation in Settings. If a later login resolves to another scope, sync is blocked as `scope-mismatch`; local data is neither uploaded nor erased. Signing out clears the Neon session but deliberately keeps SQLite and the scope binding. Local confidentiality remains the Windows user-profile boundary.

### Login UX

Settings gains a Sync Account card and Sync Status gains a navigation action:

- unconfigured: explains that the release has no sync transport and remains offline-capable;
- signed out: email/password form with `rememberMe: true`, no public scope selector, and no production self-enrollment;
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

`apps/sync-api` remains buildable and tested but is removed from normal desktop startup and release configuration. Its Hono routes become an explicit operator diagnostic adapter over the same committed PostgreSQL sync functions, using a server-only `SYNC_API_SCOPE_ID` and the existing server-only shared secret. This keeps one source of remote command behavior.

The diagnostic adapter is not a public multi-tenant production transport and its secret is never shipped in the desktop. Restoring a hosted sync service for clients would require a separate authenticated deployment decision.

Application rollback is configuration-first: remove both public Neon Variables or release the previous offline-safe client. The app immediately returns to local-only operation while outbox rows remain queued. Database rollback is forward-only: leave `0004` schema, RLS, and functions in place rather than dropping security objects or data. If a function defect exists, deploy a later corrective migration. Neon branch restore is an operator disaster-recovery tool, not the normal rollback mechanism.

## Migration and Release Sequence

1. Track A merges first into `main`, including `0003_grade_scoped_books` and its final shared deletion/grade command contract.
2. Before hostless implementation begins, merge or rebase updated `main` into the sync branch and run the full baseline gates.
3. Generate hostless schema changes as `0004` or later; never rewrite `0003`.
4. Rehearse the full migration chain on disposable PostgreSQL 17, including catalog/RLS/grant assertions.
5. Rotate the exposed Neon database credential.
6. Apply through `0004` to the development Neon branch, provision Auth/Data API, refresh schema cache, create two users in two scopes, and pass integration tests.
7. Merge Track B after combined grade/deletion plus hostless tests pass. Do not publish either branch independently; they form one combined release candidate.
8. Apply the same migration history intentionally to production Neon, provision production Auth/Data API and memberships, refresh cache, and run read-only catalog plus two-scope smoke checks.
9. Set only `NEON_AUTH_URL` and `NEON_DATA_API_URL` repository Variables.
10. Build the exact production-profile executable, prove offline boot with both values absent, then prove login/push/pull/offline-restart with the configured build.
11. Publish the signed combined release only after the global updater feed and installer checks pass.

## Testing Strategy

### Local and mock contract tests

- runtime configuration: both URLs absent, both HTTPS, partial pair, malformed, credentials in URL, and production offline boot;
- auth controller: cached signed-in session, signed-out, offline refresh, invalid credentials, sign out, missing membership, link required, and scope mismatch;
- Neon RPC client: exact RPC names/arguments, result parsing, 401 mapping, Data API error mapping, malformed payload rejection, no network calls when unconfigured;
- SyncEngine: 100-command batching, accepted/duplicate/rejected status, pending preservation on unexpected RPC error, auth-required phase, scope mismatch, and cursor loops;
- scope binding: auto-bind only for a pristine database, explicit bind for existing local data, never overwrite a different scope;
- rendered Settings and Sync Status journeys in Arabic and English;
- a fake PostgREST RPC contract that exercises every final `SyncCommand["type"]` after Track A merges.

### Migration and SQL tests

- `0004` follows `0003` in the Drizzle journal and does not modify Track A's migration;
- all synchronized tables have `relrowsecurity` and `relforcerowsecurity` enabled;
- anonymous has no table/function access;
- authenticated has no membership mutation privilege and cannot reach domain tables through the exposed schema;
- all cross-scope foreign keys and uniqueness constraints exist;
- the only exposed callable entry points are `sync_identity`, `sync_push`, and `sync_pull`;
- deterministic rejection rolls back that command while other valid commands in the batch commit;
- unexpected errors roll back the entire RPC;
- concurrent duplicate commands mutate once and return accepted/duplicate;
- concurrent issue commands cannot drive stock below zero;
- grade/deletion behavior from Track A emits and pulls the expected snapshots.

### Neon branch integration tests

A non-production branch test uses real Neon Auth and the branch Data API with two users assigned to different scopes. It proves:

- each user resolves only its membership;
- user A cannot pull, identify, update, or reference user B rows;
- a tampered payload cannot choose a scope;
- every final command type is accepted or deterministically rejected as expected;
- duplicates are idempotent across two concurrent clients;
- pull cursors are ordered and scope-filtered;
- an expired/invalid token returns 401 and never changes data;
- schema-cache refresh exposes the three functions after migration;
- disabling/removing desktop transport leaves SQLite startup and mutations functional.

Owner URLs, Neon management keys, and test account credentials exist only in local untracked files or protected CI/environment secrets. Test output redacts tokens, URLs with credentials, and user passwords.

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

1. **Beta platform surface:** pin an exact compatible `@neondatabase/neon-js` version and revalidate official docs before implementation and before release.
2. **Tauri WebView origin:** Task 2 owns the production-origin spike for `http://tauri.localhost` (unless runtime evidence differs) and must prove either embedded Neon Auth or a native device-code/external-browser JWT flow before implementation proceeds. Generic localhost access is not an acceptable workaround.
3. **SQL/TypeScript parity:** the branch integration matrix must enumerate every final shared command type; a missing case blocks release.
4. **RLS mistakes:** catalog assertions, two-user negative tests, Data API Advisors, and public-schema exclusion are mandatory.
5. **Credential hygiene:** rotate the exposed Neon credential before provisioning; no secret may appear in a `VITE_*` variable or release artifact.
6. **Migration order:** Track A owns `0003`; hostless work starts at `0004` or later after rebasing/merging main.
