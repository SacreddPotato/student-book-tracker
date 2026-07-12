# Hostless Neon Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the normal hosted Hono sync transport with authenticated Neon Data API RPCs while preserving SQLite-first offline operation, outbox/cursor/conflict semantics, and school-scope isolation.

**Architecture:** The desktop uses `@neondatabase/neon-js` for runtime identity and three RPCs in an exposed `sync_api` schema. PostgreSQL derives the caller's one active `scope_id` from `auth.user_id()`, applies commands atomically under RLS, and returns the existing push/pull shapes. The Hono app remains an explicit operator diagnostic adapter over the same database functions and is not part of desktop startup.

**Tech Stack:** React 19, TypeScript, Vite 8, Tauri 2/WebView2, SQLite, `@neondatabase/neon-js`, Neon Auth or a proven native-safe external JWT provider, Neon Data API/PostgREST, PostgreSQL 17 PL/pgSQL/RLS, Drizzle ORM/Kit, Vitest, Playwright.

## Global Constraints

- Work begins only after Track A is merged into `main`; merge or rebase that updated `main` before editing and preserve its `0003_grade_scoped_books` migration unchanged.
- Name the hostless schema migration `0004_hostless_neon_sync.sql`, or use the next number after `0004` if updated `main` already contains a later committed migration.
- Ship Track A grade/deletion and Track B hostless sync in one combined release; do not publish either independently.
- Local SQLite remains the UI source of truth and local mutations remain usable without configuration, authentication, or network access.
- Preserve outbox, pull-cursor, duplicate, deterministic rejection, and visible conflict semantics.
- Embed only public HTTPS Auth and Data API origins; never embed `DATABASE_URL`, `neondb_owner`, a Neon management API key, a JWT signing secret, `SYNC_API_SHARED_SECRET`, user credentials, or session tokens.
- Derive scope from `auth.user_id()` plus operator-managed membership inside PostgreSQL; no client payload or setting may choose `scope_id`.
- Expose only the `sync_api` schema and only the `sync_identity`, `sync_push`, and `sync_pull` RPCs.
- Keep `apps/sync-api` and `apps/desktop`; do not delete either rollback path.
- Apply every schema change through committed Drizzle history and intentionally migrate both Neon branches.
- The desktop-auth origin gate must prove the exact production Tauri origin (`http://tauri.localhost` unless runtime evidence differs) without generic localhost access, or prove a device-code/system-browser PKCE fallback before auth implementation proceeds.

---

## Planned File Map

### Shared protocol

- `packages/shared/src/protocol/sync-commands.ts`: final command union plus exported runtime command-type manifest used by parity tests.
- `packages/shared/tests/sync-commands.test.ts`: manifest and grade/deletion contract assertions.

### Desktop auth and sync

- `apps/desktop-react/src/app/runtime-config.ts`: paired public Neon origins and offline configuration.
- `apps/desktop-react/src/core/auth/auth-controller.ts`: provider-neutral session/account state machine.
- `apps/desktop-react/src/core/auth/neon-auth-adapter.ts`: embedded Neon Auth adapter if the origin gate passes.
- `apps/desktop-react/src/core/auth/native-auth-adapter.ts`: provider-neutral device-code/system-browser adapter, created only when the embedded gate fails and the fallback gate passes.
- `apps/desktop-react/src/core/auth/types.ts`: session, identity, account phase, and adapter interfaces.
- `apps/desktop-react/src/core/sync/neon-data-api-client.ts`: `SyncApiClient` implementation for the three RPCs.
- `apps/desktop-react/src/core/sync/scope-binding.ts`: local binding guard and pristine-database decision.
- `apps/desktop-react/src/core/db/repositories/sync-scope-binding.ts`: non-secret binding persistence.
- `apps/desktop-react/src/core/sync/sync-engine.ts`: bounded push batching and auth/scope phases.
- `apps/desktop-react/src/core/backend/types.ts` and backend implementations: expose auth/account controls.
- `apps/desktop-react/src/features/settings/SyncAccountCard.tsx`: login, binding, connected, and mismatch UX.
- `apps/desktop-react/src/features/sync/SyncStatus.tsx`: auth/scope-aware status and Settings navigation.

### Remote database and diagnostics

- `apps/sync-api/src/db/schema.ts`: scope/membership/applied-command definitions, final scoped keys, and policy metadata.
- `apps/sync-api/drizzle/0004_hostless_neon_sync.sql`: schemas, constraints, grants, RLS, helper functions, and RPCs.
- `apps/sync-api/drizzle/meta/0004_snapshot.json` and `_journal.json`: generated Drizzle metadata.
- `apps/sync-api/src/services/database-sync-rpc.ts`: Hono diagnostic adapter calling the committed SQL functions with server-only scope.
- `apps/sync-api/src/env.ts`: diagnostic `SYNC_API_SCOPE_ID` validation.

### Tests, workflows, and operations

- `apps/desktop-react/src/core/auth/*.test.ts`, `core/sync/*.test.ts`, and component tests: local TDD coverage.
- `apps/sync-api/tests/hostless-migration.test.ts`: SQL/catalog/grant policy assertions.
- `apps/sync-api/tests/neon-data-api.integration.test.ts`: real branch two-user/two-scope contract.
- `apps/sync-api/tests/helpers/neon-auth-test-client.ts`: test-only account/session helper with redaction.
- `.github/workflows/ci.yml`: optional protected Neon branch integration job.
- `.github/workflows/release-windows.yml`: map the two public repository Variables.
- `docs/runbooks/neon-desktop-auth-spike.md`: owned origin decision and evidence.
- `docs/runbooks/hostless-neon-sync.md` and `docs/runbooks/release.md`: provisioning, migration, rollback, and release evidence.

---

### Task 1: Integrate Track A and Freeze the Final Command Contract

**Files:**
- Modify: `packages/shared/src/protocol/sync-commands.ts`
- Modify: `packages/shared/tests/sync-commands.test.ts`
- Inspect: `apps/sync-api/drizzle/0003_grade_scoped_books.sql`
- Inspect: `apps/sync-api/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `syncCommandTypes: readonly SyncCommand["type"][]`
- Produces: final Track A book-grade and deletion command property names consumed by all later tasks.

- [ ] **Step 1: Merge or rebase updated main before implementation**

```powershell
git fetch origin main
git merge --no-edit origin/main
git status --short --branch
git log -5 --oneline --decorate
```

Expected: Track A's merge is present, `apps/sync-api/drizzle/0003_grade_scoped_books.sql` exists, and no hostless migration exists below `0004`.

- [ ] **Step 2: Run the post-merge baseline**

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit `0`. Stop and repair merge regressions before proceeding.

- [ ] **Step 3: Add a failing runtime-manifest test**

Add a test that compares the manifest to the final discriminants. The expected Track A names are `DELETE_STUDENT` and `DELETE_BOOK`; if Track A deliberately used different discriminants, use the merged union's exact names consistently and preserve this exhaustive assertion.

```ts
import { syncCommandTypes } from "../src/protocol/sync-commands";

it("exports every hostless command discriminant exactly once", () => {
  expect(syncCommandTypes).toEqual([
    "ADD_BOOK_STOCK",
    "ISSUE_BOOKS_TO_STUDENT",
    "REVERSE_TRANSACTION",
    "UPSERT_STUDENT",
    "UPSERT_BOOK",
    "INITIALIZE_ACADEMIC_YEAR",
    "ADVANCE_ACADEMIC_YEAR",
    "DELETE_STUDENT",
    "DELETE_BOOK",
  ]);
  expect(new Set(syncCommandTypes).size).toBe(syncCommandTypes.length);
});
```

- [ ] **Step 4: Run the test to verify it fails**

```powershell
npm run test -w @app/shared -- --run tests/sync-commands.test.ts
```

Expected: FAIL because `syncCommandTypes` is not exported.

- [ ] **Step 5: Export the literal manifest with type checking**

```ts
export const syncCommandTypes = [
  "ADD_BOOK_STOCK",
  "ISSUE_BOOKS_TO_STUDENT",
  "REVERSE_TRANSACTION",
  "UPSERT_STUDENT",
  "UPSERT_BOOK",
  "INITIALIZE_ACADEMIC_YEAR",
  "ADVANCE_ACADEMIC_YEAR",
  "DELETE_STUDENT",
  "DELETE_BOOK",
] as const satisfies readonly SyncCommand["type"][];
```

Use the exact merged command names and verify Track A's `UPSERT_BOOK`/delete payload includes the final grade-scoped fields.

- [ ] **Step 6: Run focused and shared tests**

```powershell
npm run test -w @app/shared -- --run tests/sync-commands.test.ts
npm run typecheck -w @app/shared
```

Expected: PASS.

- [ ] **Step 7: Commit the integration contract**

```powershell
git add packages/shared/src/protocol/sync-commands.ts packages/shared/tests/sync-commands.test.ts
git commit -m "test: freeze combined sync command contract"
```

### Task 2: Prove the Tauri Production Auth Origin or Native Fallback

**Files:**
- Create: `apps/desktop-react/src/core/auth/auth-origin.ts`
- Create: `apps/desktop-react/src/core/auth/auth-origin.test.ts`
- Create: `docs/runbooks/neon-desktop-auth-spike.md`
- Inspect: `apps/desktop-react/src-tauri/tauri.conf.json`
- Inspect: `apps/desktop-react/src-tauri/tauri.production.conf.json`

**Interfaces:**
- Produces: `readAuthOrigin(location: Pick<Location, "origin">): string`
- Produces one committed decision: `embedded-neon-auth` or `native-jwt-broker`.
- Gate: no later auth implementation begins without passing evidence for one decision.

- [ ] **Step 1: Write the failing origin unit test**

```ts
import { describe, expect, it } from "vitest";
import { readAuthOrigin } from "./auth-origin";

describe("readAuthOrigin", () => {
  it("returns the exact WebView origin without normalizing it to generic localhost", () => {
    expect(readAuthOrigin({ origin: "http://tauri.localhost" } as Location))
      .toBe("http://tauri.localhost");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```powershell
npm run test -w @app/desktop-react -- --run src/core/auth/auth-origin.test.ts
```

Expected: FAIL because `auth-origin.ts` does not exist.

- [ ] **Step 3: Implement the origin reader and temporary probe logging**

```ts
export function readAuthOrigin(location: Pick<Location, "origin">): string {
  if (!location.origin || location.origin === "null") {
    throw new Error("The Tauri WebView did not expose a usable authentication origin.");
  }
  return location.origin;
}
```

Temporarily log only this non-secret origin in the spike build; remove the log before the task commit.

- [ ] **Step 4: Build and run the exact production-profile probe**

```powershell
npm run tauri -w @app/desktop-react -- build --no-bundle --config src-tauri/tauri.production.conf.json
```

Run the resulting executable against the development Neon Auth/Data API configuration and record:

1. exact `window.location.origin`;
2. generic Allow Localhost disabled;
3. exact origin listed in Neon Auth trusted domains and Data API CORS;
4. email/password sign-in succeeds;
5. `sync_identity` probe succeeds with the SDK-injected JWT;
6. process restart restores the session;
7. an expired access token refreshes successfully;
8. sign out removes the session.

Never record tokens, cookies, passwords, or credential-bearing URLs.

- [ ] **Step 5: Exercise the mandated fallback if embedded auth fails**

If any embedded check fails because the production WebView origin is unsupported, test a provider-supported system-browser authorization-code-with-PKCE loopback flow or device-authorization flow. The fallback must satisfy:

```ts
export interface NativeJwtBroker {
  signIn(): Promise<{ accessToken: string; subject: string; expiresAt: string }>;
  refresh(): Promise<{ accessToken: string; expiresAt: string }>;
  signOut(): Promise<void>;
}
```

The selected provider's JWKS must be accepted by the development Data API; the flow must use no client secret and must preserve a stable JWT `sub`. If neither native flow passes, stop: this is a genuine implementation blocker.

- [ ] **Step 6: Write the runbook evidence and decision**

The runbook must include date, exact executable profile, exact non-secret origin, Neon settings used, test matrix, selected decision, SDK/provider versions, and redacted evidence. It must state why the unused path was rejected.

- [ ] **Step 7: Verify and commit the gate**

```powershell
npm run test -w @app/desktop-react -- --run src/core/auth/auth-origin.test.ts
git diff --check
git add apps/desktop-react/src/core/auth/auth-origin.ts apps/desktop-react/src/core/auth/auth-origin.test.ts docs/runbooks/neon-desktop-auth-spike.md
git commit -m "docs: prove desktop authentication origin"
```

Expected: test PASS and the runbook records one passing auth path.

### Task 3: Add Paired Runtime Configuration and Provider-Neutral Auth State

**Files:**
- Modify: `apps/desktop-react/package.json`
- Modify: `package-lock.json`
- Modify: `apps/desktop-react/src/app/runtime-config.ts`
- Modify: `apps/desktop-react/src/app/runtime-config.test.ts`
- Modify: `apps/desktop-react/.env.example`
- Modify: `apps/desktop-react/.env.production-release`
- Create: `apps/desktop-react/src/core/auth/types.ts`
- Create: `apps/desktop-react/src/core/auth/auth-controller.ts`
- Create: `apps/desktop-react/src/core/auth/auth-controller.test.ts`
- Create one selected adapter: `neon-auth-adapter.ts` or `native-auth-adapter.ts`

**Interfaces:**
- Produces: `RuntimeConfig.neonAuthUrl: string | null`
- Produces: `RuntimeConfig.neonDataApiUrl: string | null`
- Produces: `AuthAdapter`, `AuthAccountState`, and `AuthController`.

- [ ] **Step 1: Write failing paired-configuration tests**

```ts
it("accepts two public HTTPS Neon origins", () => {
  expect(resolveRuntimeConfig({
    VITE_DESKTOP_PROFILE: "production",
    VITE_NEON_AUTH_URL: "https://auth.example.test/neondb/auth",
    VITE_NEON_DATA_API_URL: "https://api.example.test/neondb/rest/v1",
  })).toMatchObject({
    neonAuthUrl: "https://auth.example.test/neondb/auth",
    neonDataApiUrl: "https://api.example.test/neondb/rest/v1",
  });
});

it.each([
  [{ VITE_NEON_AUTH_URL: "https://auth.example.test" }],
  [{ VITE_NEON_DATA_API_URL: "https://api.example.test" }],
])("rejects a partial Neon pair", (env) => {
  expect(() => resolveRuntimeConfig(env)).toThrow("configured together");
});
```

Also test both absent, `http:`, embedded credentials, and the removal of `VITE_SYNC_API_SHARED_SECRET` from runtime output.

- [ ] **Step 2: Write failing auth-controller tests**

```ts
it("restores a cached session without blocking local bootstrap", async () => {
  const adapter = fakeAdapter({ user: { id: "user-a", email: "a@example.test" } });
  const controller = createAuthController(adapter);
  await controller.initialize();
  expect(controller.store.getSnapshot()).toMatchObject({ phase: "signedIn", userId: "user-a" });
});

it("reports offline when session refresh cannot reach the provider", async () => {
  const controller = createAuthController(fakeAdapter({ error: new TypeError("fetch failed") }));
  await controller.initialize();
  expect(controller.store.getSnapshot().phase).toBe("offline");
});
```

- [ ] **Step 3: Run tests to verify they fail**

```powershell
npm run test -w @app/desktop-react -- --run src/app/runtime-config.test.ts src/core/auth/auth-controller.test.ts
```

Expected: FAIL on missing Neon fields and auth files.

- [ ] **Step 4: Install the exact SDK selected by Task 2**

For `embedded-neon-auth`:

```powershell
npm install @neondatabase/neon-js --workspace @app/desktop-react --save-exact
```

For `native-jwt-broker`, install the provider's official browser/native PKCE SDK at an exact version and document it in the spike runbook. Do not install both implementations.

- [ ] **Step 5: Implement paired configuration**

```ts
export type RuntimeConfig = {
  profile: DesktopProfile;
  databaseUrl: string;
  databaseFile: string;
  neonAuthUrl: string | null;
  neonDataApiUrl: string | null;
  updaterEnabled: boolean;
};
```

Normalize both strings, require both-or-none, require credential-free HTTPS, and keep both absent as intentional offline configuration.

- [ ] **Step 6: Implement provider-neutral auth types**

```ts
export type AuthAccountPhase =
  | "unconfigured" | "checking" | "signedOut" | "signingIn"
  | "signedIn" | "offline" | "membershipMissing" | "linkRequired"
  | "connected" | "scopeMismatch" | "error";

export type RuntimeSession = { userId: string; email: string };

export interface AuthAdapter {
  getSession(): Promise<RuntimeSession | null>;
  signIn(input: { email: string; password: string; rememberMe: true }): Promise<RuntimeSession>;
  signOut(): Promise<void>;
}
```

The native adapter may ignore email/password parameters and launch its proven device/system-browser flow, but it must return the same `RuntimeSession`.

- [ ] **Step 7: Implement controller transitions and secret hygiene**

The controller owns an `ExternalStore<AuthAccountState>`, catches offline errors, never serializes tokens, and clears SDK/provider session state on sign out. `getSession()` runs after SQLite initialization, not before render.

- [ ] **Step 8: Run focused tests and commit**

```powershell
npm run test -w @app/desktop-react -- --run src/app/runtime-config.test.ts src/core/auth/auth-controller.test.ts
npm run typecheck -w @app/desktop-react
git add apps/desktop-react/package.json package-lock.json apps/desktop-react/src/app apps/desktop-react/src/core/auth apps/desktop-react/.env.example apps/desktop-react/.env.production-release
git commit -m "feat: add runtime sync authentication"
```

### Task 4: Create the Scoped Remote Schema, Grants, and RLS Migration

**Files:**
- Modify: `apps/sync-api/src/db/schema.ts`
- Create: `apps/sync-api/drizzle/0004_hostless_neon_sync.sql`
- Create: `apps/sync-api/drizzle/meta/0004_snapshot.json`
- Modify: `apps/sync-api/drizzle/meta/_journal.json`
- Create: `apps/sync-api/tests/hostless-migration.test.ts`

**Interfaces:**
- Produces tables: `sync_scopes`, `sync_scope_memberships`, `applied_sync_commands`.
- Produces helper: `sync_private.current_scope_id() returns text`.
- Produces RLS-protected final domain schema for RPC tasks.

- [ ] **Step 1: Write failing schema/migration tests**

Assert `0004` follows `0003`, contains no credential literal, exposes `sync_api` but not `public`, enables and forces RLS for every synchronized table, revokes anonymous/public access, and includes the exact tables/indexes/constraints.

```ts
expect(journal.entries.at(-1)?.tag).toBe("0004_hostless_neon_sync");
expect(sql).toContain("ALTER TABLE \"books\" ENABLE ROW LEVEL SECURITY");
expect(sql).toContain("ALTER TABLE \"books\" FORCE ROW LEVEL SECURITY");
expect(sql).toContain("CREATE INDEX \"sync_changes_scope_sequence_idx\"");
expect(sql).not.toMatch(/postgres(?:ql)?:\/\//i);
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test -w @app/sync-api -- --run tests/hostless-migration.test.ts
```

Expected: FAIL because `0004` does not exist.

- [ ] **Step 3: Update Drizzle schema definitions**

Add exact records:

```ts
export const syncScopes = pgTable("sync_scopes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const syncScopeMemberships = pgTable("sync_scope_memberships", {
  userId: text("user_id").primaryKey(),
  scopeId: text("scope_id").notNull().references(() => syncScopes.id),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
});
```

Define `applied_sync_commands` with primary key `(scope_id, command_id)`. Add `scope_id` to academic years/items and every Track A table missing it. Add composite cross-scope foreign keys and `(scope_id, sequence)`.

- [ ] **Step 4: Generate metadata, then hand-author reviewed security SQL**

```powershell
npm run db:generate -w @app/sync-api
```

Rename the generated migration to `0004_hostless_neon_sync.sql` if required and keep the journal tag aligned. Add schemas, explicit grants/revokes, `ENABLE/FORCE ROW LEVEL SECURITY`, membership self-read, and common scope policies. Backfill existing data to `scope_id = 'global'`; create the `global` scope but no membership.

Core policy form:

```sql
CREATE POLICY books_scope_policy ON public.books
FOR ALL TO authenticated
USING (scope_id = sync_private.current_scope_id())
WITH CHECK (scope_id = sync_private.current_scope_id());
```

`sync_private.current_scope_id()` is security invoker, returns one non-revoked membership for `auth.user_id()`, and raises SQLSTATE `42501` when none exists.

- [ ] **Step 5: Rehearse on disposable PostgreSQL 17**

Use the repository migration runner against a disposable empty PostgreSQL 17 database, then query `pg_class.relrowsecurity`, `relforcerowsecurity`, `pg_policies`, `information_schema.role_table_grants`, and `has_function_privilege`.

Expected: all asserted tables protected, anonymous denied, authenticated unable to mutate membership, cross-scope constraints present.

- [ ] **Step 6: Run focused tests and commit**

```powershell
npm run test -w @app/sync-api -- --run tests/hostless-migration.test.ts tests/schema.test.ts
npm run typecheck -w @app/sync-api
git add apps/sync-api/src/db/schema.ts apps/sync-api/drizzle apps/sync-api/tests/hostless-migration.test.ts
git commit -m "feat: add scoped Neon RLS schema"
```

### Task 5: Implement Identity and Cursor Pull RPCs

**Files:**
- Modify: `apps/sync-api/drizzle/0004_hostless_neon_sync.sql`
- Modify: `apps/sync-api/tests/hostless-migration.test.ts`
- Create: `apps/sync-api/tests/sql-rpc-contract.test.ts`

**Interfaces:**
- Produces: `sync_api.sync_identity() returns jsonb`
- Produces: `sync_api.sync_pull(p_since bigint) returns jsonb`

- [ ] **Step 1: Write failing SQL contract tests**

Create user A/scope A and user B/scope B under a test `auth.user_id()` shim. Insert interleaved changes, then assert identity and pulls are isolated.

```ts
expect(await rpcAs("user-a", "sync_identity", {})).toEqual({
  userId: "user-a", scopeId: "scope-a", scopeName: "School A", role: "owner",
});
expect((await rpcAs("user-a", "sync_pull", { p_since: 0 })).changes)
  .toEqual([expect.objectContaining({ commandId: "a-1" })]);
```

Also assert negative cursor and missing membership fail with stable authorization/validation errors.

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm run test -w @app/sync-api -- --run tests/sql-rpc-contract.test.ts
```

Expected: FAIL because functions do not exist.

- [ ] **Step 3: Implement `sync_identity`**

Return camelCase JSON keys from `auth.user_id()`, the one active membership, and scope label. Grant execute only to `authenticated`; revoke from `PUBLIC` and `anonymous`.

- [ ] **Step 4: Implement `sync_pull`**

Validate `p_since >= 0`; query the derived scope ordered by sequence with hard limit 200; map snake_case columns to the existing camelCase payload; return supplied cursor when empty.

Representative result construction:

```sql
jsonb_build_object(
  'changes', coalesce(jsonb_agg(change_row ORDER BY sequence), '[]'::jsonb),
  'nextCursor', coalesce(max(sequence)::text, p_since::text)
)
```

- [ ] **Step 5: Run tests and commit**

```powershell
npm run test -w @app/sync-api -- --run tests/sql-rpc-contract.test.ts tests/hostless-migration.test.ts
git add apps/sync-api/drizzle/0004_hostless_neon_sync.sql apps/sync-api/tests
git commit -m "feat: add scoped identity and pull RPCs"
```

### Task 6: Implement Atomic Push RPC and Final Command Matrix

**Files:**
- Modify: `apps/sync-api/drizzle/0004_hostless_neon_sync.sql`
- Modify: `apps/sync-api/tests/sql-rpc-contract.test.ts`
- Modify: `apps/sync-api/tests/apply-command.test.ts`

**Interfaces:**
- Produces: `sync_api.sync_push(p_commands jsonb) returns jsonb`
- Consumes: final `SyncCommand` union and rejection codes from Task 1.

- [ ] **Step 1: Add failing push tests for every final command type**

The matrix must cover initialize year, upsert grade-scoped book, upsert student, stock receipt, mixed-semester issue, reversal, exact successor promotion, Track A student deletion, and Track A book deletion. For each, assert domain snapshots and `sync_changes`. Add rejected cases for every existing reason code.

- [ ] **Step 2: Add failing concurrency/idempotency tests**

Run two clients with the same command and two clients competing for one stock unit. Assert one mutation, accepted/duplicate for the duplicate pair, and no negative stock.

- [ ] **Step 3: Run tests to verify they fail**

```powershell
npm run test -w @app/sync-api -- --run tests/sql-rpc-contract.test.ts tests/apply-command.test.ts
```

Expected: FAIL because `sync_push` is missing.

- [ ] **Step 4: Implement batch envelope and duplicate receipt**

Reject non-arrays, empty arrays, and more than 100 commands. Derive scope once, acquire `pg_advisory_xact_lock(hashtextextended(scope_id, 0))`, and process in input order. Each command block inserts `(scope_id, command_id)` with `ON CONFLICT DO NOTHING`; conflict returns duplicate without writes.

```sql
IF jsonb_typeof(p_commands) <> 'array'
   OR jsonb_array_length(p_commands) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Sync push requires 1 to 100 commands.';
END IF;
```

- [ ] **Step 5: Port each command's exact invariant into private PL/pgSQL helpers**

Implement one focused helper per command type under `sync_private`. Every helper receives derived `p_scope_id` and JSON command, never a client scope. Preserve:

- positive integer receipt stock with real ISO date and current year;
- stage/grade validation and Track A grade-scoped book identity;
- unique semester selections, stage/grade compatibility, and sufficient stock;
- exact-semester reversal and one reversal only;
- exact-successor year advance and exact promotion snapshot set;
- Track A deletion preconditions, soft-delete fields, and emitted snapshots;
- deterministic sorted row locks;
- existing IDs, timestamps, reason codes, and pull dependency ordering.

Business rejection uses a private exception carrying `reasonCode` and message; the per-command exception block rolls back only that command and appends a rejected result. Any other SQLSTATE is re-raised and rolls back the whole RPC.

- [ ] **Step 6: Add command-change recording helper**

`sync_private.record_change` always inserts derived scope, command ID, entity table/id, `to_jsonb(row)::text`, and occurred/created timestamp. It never accepts scope from command JSON.

- [ ] **Step 7: Prove TypeScript/SQL parity**

Add a test that loads `syncCommandTypes` and compares it with a migration comment manifest:

```sql
-- sync-command-types: ADD_BOOK_STOCK,ISSUE_BOOKS_TO_STUDENT,REVERSE_TRANSACTION,
-- UPSERT_STUDENT,UPSERT_BOOK,INITIALIZE_ACADEMIC_YEAR,ADVANCE_ACADEMIC_YEAR,
-- DELETE_STUDENT,DELETE_BOOK
```

The test fails if a shared type lacks an SQL case.

- [ ] **Step 8: Run focused tests and commit**

```powershell
npm run test -w @app/sync-api -- --run tests/sql-rpc-contract.test.ts tests/apply-command.test.ts tests/hostless-migration.test.ts
npm run typecheck -w @app/sync-api
git add apps/sync-api/drizzle/0004_hostless_neon_sync.sql apps/sync-api/tests
git commit -m "feat: apply sync commands in Postgres RPC"
```

### Task 7: Add the Authenticated Neon Client and Scope-Binding Guard

**Files:**
- Create: `apps/desktop-react/src/core/sync/neon-data-api-client.ts`
- Create: `apps/desktop-react/src/core/sync/neon-data-api-client.test.ts`
- Create: `apps/desktop-react/src/core/db/repositories/sync-scope-binding.ts`
- Create: `apps/desktop-react/src/core/sync/scope-binding.ts`
- Create: `apps/desktop-react/src/core/sync/scope-binding.test.ts`
- Modify: `apps/desktop-react/src/core/sync/api-client.ts`

**Interfaces:**
- Implements existing `SyncApiClient.push()` and `.pull()`.
- Produces: `resolveIdentity(): Promise<SyncIdentity>`.
- Produces: `ScopeBindingGuard.authorize(identity): Promise<"ready" | "linkRequired" | "scopeMismatch">`.

- [ ] **Step 1: Write failing exact-RPC tests**

```ts
await client.push([command]);
expect(rpc).toHaveBeenCalledWith("sync_push", { p_commands: [command] });

await client.pull("8");
expect(rpc).toHaveBeenCalledWith("sync_pull", { p_since: 8 });
```

Test `sync_identity`, malformed data, 401/auth errors, other PostgREST errors, and unconfigured no-request behavior.

- [ ] **Step 2: Write failing binding tests**

Cover pristine auto-bind, existing domain/outbox rows requiring explicit link, matching scope, and mismatch that never overwrites binding.

- [ ] **Step 3: Run tests to verify failure**

```powershell
npm run test -w @app/desktop-react -- --run src/core/sync/neon-data-api-client.test.ts src/core/sync/scope-binding.test.ts
```

- [ ] **Step 4: Implement typed RPC adapter**

Use the selected Task 2 session implementation. For embedded Neon Auth, pass the same `createClient({ auth, dataApi })` instance so the SDK injects/refreshed JWTs. Map payloads to the existing transport types and throw typed `SyncAuthenticationRequiredError`, `SyncMembershipError`, and `SyncProtocolError` without including raw response headers.

- [ ] **Step 5: Implement non-secret binding persistence**

```ts
export type SyncScopeBinding = {
  scopeId: string;
  scopeName: string;
  boundAt: string;
};
```

Store it under `app_settings.key = 'sync_scope_binding'`. Pristine means zero rows across academic years, students, books, inventory transactions, student books, and sync outbox. `linkCurrentScope()` is the only method allowed to persist a non-pristine first binding.

- [ ] **Step 6: Run tests and commit**

```powershell
npm run test -w @app/desktop-react -- --run src/core/sync/neon-data-api-client.test.ts src/core/sync/scope-binding.test.ts
npm run typecheck -w @app/desktop-react
git add apps/desktop-react/src/core/sync apps/desktop-react/src/core/db/repositories/sync-scope-binding.ts
git commit -m "feat: add scoped Neon sync client"
```

### Task 8: Integrate Batching, Auth Phases, and Offline Bootstrap

**Files:**
- Modify: `apps/desktop-react/src/core/db/repositories/outbox.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.test.ts`
- Modify: `apps/desktop-react/src/core/backend/types.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.test.ts`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.ts`
- Modify: `apps/desktop-react/src/app/AppLifecycle.tsx`

**Interfaces:**
- Adds sync phases: `authentication-required`, `membership-required`, `scope-mismatch`.
- Adds `AppBackend.auth` and `AppBackend.linkSyncScope()`.

- [ ] **Step 1: Write failing engine tests**

Assert 205 pending commands produce RPC batches of 100, 100, and 5; an unexpected third-batch error leaves only the final five pending; 401 maps to authentication-required; mismatch does not call push/pull; normal pull transaction behavior is unchanged.

- [ ] **Step 2: Write a failing production-offline backend test**

Construct runtime config without Neon origins, initialize SQLite, save inventory data, and assert no network request occurs and phase is offline/unconfigured.

- [ ] **Step 3: Run tests to verify they fail**

```powershell
npm run test -w @app/desktop-react -- --run src/core/sync/sync-engine.test.ts src/core/backend/tauri-backend.test.ts
```

- [ ] **Step 4: Bound and drain outbox batches**

Change `listPendingOutboxRows(database, limit = 100)` to append `LIMIT $1`. In `sync()`, repeat read/prepare/push/apply until no pending rows remain. Keep invalid JSON rejection local and keep each result batch update transactional.

- [ ] **Step 5: Wire auth, identity, and binding after SQLite initialization**

`createTauriBackend` opens/migrates SQLite first, creates the unavailable client when origins are absent, then creates the selected auth adapter, Neon client, binding guard, and engine. Auth initialization is started after backend initialization and cannot reject app bootstrap.

- [ ] **Step 6: Map explicit phases without leaking secrets**

401/session absent -> authentication-required; no membership -> membership-required; binding mismatch -> scope-mismatch; fetch/network -> offline; unexpected protocol/SQL -> error. Only deterministic command results create rejected conflicts.

- [ ] **Step 7: Run tests and commit**

```powershell
npm run test -w @app/desktop-react -- --run src/core/sync/sync-engine.test.ts src/core/backend/tauri-backend.test.ts src/core/sync/sync-runner.test.ts
npm run typecheck -w @app/desktop-react
git add apps/desktop-react/src/core apps/desktop-react/src/app/AppLifecycle.tsx
git commit -m "feat: integrate authenticated offline sync"
```

### Task 9: Add Login, Link, and Scope-Mismatch UX

**Files:**
- Create: `apps/desktop-react/src/features/settings/SyncAccountCard.tsx`
- Create: `apps/desktop-react/src/features/settings/SyncAccountCard.test.tsx`
- Modify: `apps/desktop-react/src/features/settings/SettingsScreen.tsx`
- Modify: `apps/desktop-react/src/features/settings/SettingsScreen.test.tsx`
- Modify: `apps/desktop-react/src/features/sync/SyncStatus.tsx`
- Modify: `apps/desktop-react/src/features/sync/SyncStatus.test.tsx`
- Modify: `apps/desktop-react/src/core/i18n/en.ts`
- Modify: `apps/desktop-react/src/core/i18n/ar.ts`
- Modify: `apps/desktop-react/src/styles/operations.css`
- Modify: `apps/desktop-react/tests/e2e/settings-sync.spec.ts`

**Interfaces:**
- Consumes: `backend.auth.store`, `signIn`, `signOut`, `linkSyncScope`, `requestSync`.

- [ ] **Step 1: Write failing component tests for every state**

Render unconfigured, signed out, signing in, membership missing, link required, connected, offline-cached, and mismatch. Assert Arabic/English labels, password never echoed, link confirmation names the remote school, mismatch names local/remote schools, and sign out remains available.

- [ ] **Step 2: Write a failing rendered journey**

The fixture scenario signs in, requires linking existing data, links, syncs, restarts offline, and renders local students/books. A second fixture identity from another scope must show mismatch and must not call push.

- [ ] **Step 3: Run tests to verify they fail**

```powershell
npm run test -w @app/desktop-react -- --run src/features/settings/SyncAccountCard.test.tsx src/features/sync/SyncStatus.test.tsx
npm run test:e2e -w @app/desktop-react -- --grep "sync account"
```

- [ ] **Step 4: Implement accessible account card**

Use a real form with email/password labels, busy/disabled state, `autocomplete="username"` and `autocomplete="current-password"`, `rememberMe: true`, safe errors, and explicit link confirmation. Do not add a scope input or production signup button.

- [ ] **Step 5: Extend status and navigation**

Status maps auth/membership/mismatch phases to distinct copy and opens Settings through the existing navigation blocker. Offline and unconfigured copy explicitly says local work is queued/available.

- [ ] **Step 6: Run accessibility and component journeys**

```powershell
npm run test -w @app/desktop-react -- --run src/features/settings/SyncAccountCard.test.tsx src/features/settings/SettingsScreen.test.tsx src/features/sync/SyncStatus.test.tsx
npm run test:e2e -w @app/desktop-react -- --grep "sync account"
```

Expected: PASS with no axe violations.

- [ ] **Step 7: Commit**

```powershell
git add apps/desktop-react/src/features apps/desktop-react/src/core/i18n apps/desktop-react/src/styles apps/desktop-react/tests/e2e/settings-sync.spec.ts
git commit -m "feat: add sync account experience"
```

### Task 10: Point the Hono Diagnostic Service at the Same SQL Functions

**Files:**
- Create: `apps/sync-api/src/services/database-sync-rpc.ts`
- Create: `apps/sync-api/tests/database-sync-rpc.test.ts`
- Modify: `apps/sync-api/src/routes/sync.ts`
- Modify: `apps/sync-api/src/index.ts`
- Modify: `apps/sync-api/src/env.ts`
- Modify: `apps/sync-api/.env.example`
- Modify: `apps/sync-api/tests/sync-routes.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `DatabaseSyncRpc.push(scopeId, commands)` and `.pull(scopeId, since)`.
- Adds server-only `SYNC_API_SCOPE_ID` for diagnostic operation.

- [ ] **Step 1: Write failing adapter/env tests**

Assert the adapter calls private scope-explicit SQL wrappers and returns existing route payloads. Assert production/diagnostic env requires non-empty `SYNC_API_SCOPE_ID`; no `VITE_*` variable is accepted.

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm run test -w @app/sync-api -- --run tests/database-sync-rpc.test.ts tests/sync-routes.test.ts tests/schema.test.ts
```

- [ ] **Step 3: Implement operator-only SQL adapter**

The owner-connected Hono service calls `sync_private.sync_push_for_scope($scope, $commands)` and `sync_private.sync_pull_for_scope($scope, $since)`. These wrappers delegate to the same private helpers as public RPCs. Keep the timing-safe shared-secret route guard.

- [ ] **Step 4: Remove Hono from normal desktop startup**

Change root scripts so `npm run dev:desktop` starts the React/Tauri desktop only. Keep `npm run dev:api`. Add `dev:desktop:diagnostic-sync` for an explicit combined operator session; do not pass its shared secret to a production desktop build.

- [ ] **Step 5: Run tests and commit**

```powershell
npm run test -w @app/sync-api -- --run tests/database-sync-rpc.test.ts tests/sync-routes.test.ts tests/schema.test.ts
npm run typecheck -w @app/sync-api
git add apps/sync-api package.json
git commit -m "refactor: retain Hono as sync diagnostic adapter"
```

### Task 11: Add Real Neon Branch Isolation and Contract Tests

**Files:**
- Create: `apps/sync-api/tests/neon-data-api.integration.test.ts`
- Create: `apps/sync-api/tests/helpers/neon-auth-test-client.ts`
- Modify: `apps/sync-api/package.json`
- Modify: `.github/workflows/ci.yml` (or the exact CI workflow discovered in Task 1)
- Modify: `.gitignore` if a local integration env filename needs explicit protection

**Interfaces:**
- Consumes protected variables: `NEON_TEST_DATABASE_URL`, `NEON_TEST_AUTH_URL`, `NEON_TEST_DATA_API_URL`.
- Produces command: `npm run test:integration:neon -w @app/sync-api`.

- [ ] **Step 1: Write the integration suite with an explicit skip contract**

Without all three environment values, print one safe skip reason and run no network calls. With values, create unique test users A/B via Auth, insert scopes/memberships through the owner test URL, then execute all tests through Data API JWT sessions.

- [ ] **Step 2: Add two-scope negative and concurrency cases**

Prove identity isolation, scope-filtered pull, tampered scope rejection, cross-scope foreign-key denial, all final command types, concurrent duplicate, stock race, invalid/expired JWT 401, and no data change after failed authorization.

- [ ] **Step 3: Add migration/schema-cache setup and cleanup**

Apply the full migration history to a disposable/non-production branch. Refresh schema cache through protected CI operator tooling. Delete only test-created users/memberships/scopes by unique prefix. Redact tokens/passwords and credential-bearing URLs in all output.

- [ ] **Step 4: Run against the development Neon branch**

```powershell
npm run test:integration:neon -w @app/sync-api
```

Expected: PASS for two users/two scopes. Record branch ID and endpoint fingerprints, not secrets.

- [ ] **Step 5: Add protected CI coverage**

Run the integration job only where protected environment secrets are available. Fork PRs and ordinary local tests must skip it safely. The job runs after unit/type/lint gates and before a release candidate can be tagged.

- [ ] **Step 6: Commit**

```powershell
git add apps/sync-api/tests apps/sync-api/package.json .github/workflows .gitignore
git commit -m "test: verify Neon Data API scope isolation"
```

### Task 12: Update Release Configuration and Operator Runbooks

**Files:**
- Modify: `.github/workflows/release-windows.yml`
- Create: `docs/runbooks/hostless-neon-sync.md`
- Modify: `docs/runbooks/release.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Maps repository Variables `NEON_AUTH_URL` and `NEON_DATA_API_URL` to the two public Vite values.

- [ ] **Step 1: Write failing workflow/runbook assertions**

Add or extend tests to assert the release workflow includes both public variables and excludes `DATABASE_URL`, `SYNC_API_SHARED_SECRET`, `NEON_API_KEY`, and any JWT secret from the Tauri build environment.

- [ ] **Step 2: Run the assertion to verify failure**

```powershell
npm run test -w @app/desktop-react -- --run src/app/runtime-config.test.ts
```

Expected: FAIL until workflow/config fixtures are updated.

- [ ] **Step 3: Map public release Variables**

```yaml
env:
  VITE_NEON_AUTH_URL: ${{ vars.NEON_AUTH_URL }}
  VITE_NEON_DATA_API_URL: ${{ vars.NEON_DATA_API_URL }}
```

Remove `VITE_SYNC_API_BASE_URL` from the normal release build.

- [ ] **Step 4: Write the hostless runbook**

Document credential rotation, Track A/0003 then Track B/0004 order, dev-before-prod migration, Auth/Data API branch provisioning, exact-origin settings, scope/user membership provisioning, schema-cache refresh, Data API Advisors, integration commands, redaction, configuration-first rollback, and Hono diagnostic usage.

- [ ] **Step 5: Update AGENTS.md with exact evidence and next point**

Record the implementation status, test counts/commands, redacted branch fingerprints, migration rows, origin-gate result, and the exact next release step. Preserve the handoff rule and do not recreate a historical journal.

- [ ] **Step 6: Run docs/config checks and commit**

```powershell
git diff --check
npm run test -w @app/desktop-react -- --run src/app/runtime-config.test.ts
git add .github/workflows/release-windows.yml docs/runbooks AGENTS.md
git commit -m "docs: add hostless sync operations"
```

### Task 13: Run Combined Verification, Migrate Both Branches, and Release

**Files:**
- Modify: `AGENTS.md`
- Modify: release version files only when the combined release version is chosen.

**Interfaces:**
- Produces one combined grade/deletion + hostless sync release candidate.

- [ ] **Step 1: Run the full local gate**

```powershell
npm run test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test --manifest-path apps/desktop-react/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
```

Expected: all pass, including Track A grade/deletion and all sync account journeys.

- [ ] **Step 2: Rehearse the exact migration chain**

Apply `0000` through `0004` to disposable PostgreSQL 17. Verify Drizzle rows, RLS/force flags, grants, constraints, functions, and zero leaked cross-scope rows.

- [ ] **Step 3: Rotate credentials and migrate development Neon**

Rotate the exposed credential first. Apply migrations intentionally, refresh Data API schema cache, run Advisors and `test:integration:neon`, then record redacted evidence.

- [ ] **Step 4: Migrate production Neon intentionally**

Apply the identical migration history, provision Auth/Data API and operator-approved memberships, refresh cache, and run read-only catalog plus two-scope smoke tests. Never print or commit the owner URL.

- [ ] **Step 5: Prove exact production desktop modes**

Build and inspect one production-profile executable with both public values absent: it must render Arabic, remain maximized, open existing SQLite, and queue mutations offline. Build the configured candidate: sign in, bind scope, push every final command family, pull on a second client, restart offline, and continue local work.

- [ ] **Step 6: Publish only the combined release**

Merge Track B after green CI, choose/version the combined release, create the signed tag through the existing validated workflow, verify installer/version/signature/digests/global updater feed, and update `AGENTS.md` with exact evidence.

- [ ] **Step 7: Commit final handoff evidence**

```powershell
git add AGENTS.md
git commit -m "docs: record hostless sync release evidence"
```

---

## Plan Self-Review Checklist

- Every design requirement maps to a task: platform origin gate (2), config/auth (3), RLS/schema (4), identity/pull (5), atomic push/duplicates (6), desktop transport/binding (7-8), UX/offline restart (9), rollback Hono (10), mock and real branch tests (7-11), release order/migrations (1, 12-13).
- Track A owns `0003`; all hostless schema work begins at `0004` or later after updated main is integrated.
- The command parity test prevents silent drift after Track A lands.
- Only three client RPCs are exposed and no task adds a client-selectable scope.
- No task embeds or logs owner, management, JWT-signing, shared-secret, or user credentials.
- The origin concern has an owned, blocking spike and a native-safe fallback gate; generic localhost enablement is explicitly rejected.
- Each implementation task starts with a failing test, names the exact verification command and expected result, and ends with a focused commit.
