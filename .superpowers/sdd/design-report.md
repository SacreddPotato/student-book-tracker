# Track B Design Report: Hostless Neon Sync

## Status

Complete. The auto-approved architecture spec, detailed TDD implementation plan, and current handoff in `AGENTS.md` were created on branch `codex/hostless-neon-sync`. No production code, Drizzle migration, Neon schema mutation, or release configuration mutation was made in this design-only segment.

## Artifacts

- Design: `docs/superpowers/specs/2026-07-12-hostless-neon-sync-design.md`
- Plan: `docs/superpowers/plans/2026-07-12-hostless-neon-sync.md`
- Handoff: `AGENTS.md`
- Planning artifact commit: `67a602dabe86479b90be4133430ab09af4de5f9b`

## Official Sources Refreshed on 2026-07-12

- Neon Data API overview: https://neon.com/docs/data-api/overview
- Neon Data API getting started: https://neon.com/docs/data-api/get-started
- Neon Data API access control and RLS: https://neon.com/docs/data-api/access-control
- Neon Data API management, exposed schemas, CORS, and providers: https://neon.com/docs/data-api/manage
- Neon Auth plus Data API React guide: https://neon.com/guides/react-neon-auth-data-api
- Neon Auth React API methods: https://neon.com/docs/auth/quick-start/react
- Neon Auth and Data API TypeScript SDK reference: https://neon.com/docs/reference/javascript-sdk
- Neon Auth production checklist: https://neon.com/docs/auth/production-checklist
- Neon row-level security overview: https://neon.com/docs/guides/row-level-security

The current docs establish that the Data API is a branch-level, stateless, PostgREST-compatible HTTPS surface; JWT requests run as `authenticated`; `auth.user_id()` derives from JWT `sub`; RLS and grants enforce access; `.rpc()` and managed token injection/refresh are available; exposed schemas and CORS are configurable; and Data API/Neon Auth remain Beta.

## Chosen Architecture

Use Neon Auth plus the Neon Data API and PostgreSQL RLS. Expose only a `sync_api` schema with three RPCs:

1. `sync_identity()` derives the current Auth user and one active school membership.
2. `sync_push(p_commands jsonb)` serializes one scope, applies up to 100 commands atomically, records idempotency and change rows, and returns the existing accepted/rejected/duplicate result shape.
3. `sync_pull(p_since bigint)` returns at most 200 ordered, scope-filtered changes and the next numeric cursor.

The desktop remains SQLite-first. It keeps the existing outbox, local transaction, pull cursor, conflict, sync runner, and offline boot behavior. `@neondatabase/neon-js` supplies runtime sessions and authenticated Data API calls after SQLite startup. The desktop stores only a non-secret local scope binding; it never stores JWTs in SQLite or accepts a client-selected scope.

Only `sync_api` is exposed through Data API. Domain tables stay in `public`, direct table CRUD is not used, `anonymous` receives no privileges, and synchronized tables use forced RLS with scope derived from `auth.user_id()` membership. Composite keys/foreign keys prevent cross-scope references.

The direct serverless-driver alternative was rejected because a restricted database login would still be extractable from the desktop and would expose a broader SQL surface. A bundled owner URL was rejected as a full-database compromise and a direct violation of the security boundary.

`apps/sync-api` remains an explicit operator diagnostic adapter over the same SQL functions but leaves normal desktop startup and release runtime.

## Integration and Release Order

Track A merges first into `main` and owns `0003_grade_scoped_books`. Before hostless implementation, updated `main` is merged/rebased into the sync branch and the final grade/deletion command union is frozen with an exhaustive runtime manifest. Hostless remote schema work starts at `0004` or later. Track A and Track B ship only in one combined release.

The exposed Neon credential is rotated before online work. The full migration chain is rehearsed on disposable PostgreSQL 17, then applied intentionally to development Neon and tested with two Auth users in two scopes. Production is migrated only after those gates pass. Release configuration contains only paired public Auth/Data API origins.

## Plan Task List

1. Integrate Track A and freeze the final command contract.
2. Prove the exact production Tauri Auth origin or a native device-code/system-browser PKCE fallback.
3. Add paired runtime configuration and provider-neutral auth state.
4. Create scoped remote schema, grants, composite constraints, and forced RLS in migration `0004+`.
5. Implement identity and cursor-pull RPCs.
6. Implement atomic push RPC and exhaustive final command matrix.
7. Add authenticated Neon client and local scope-binding guard.
8. Integrate 100-command batching, auth phases, mismatch protection, and offline bootstrap.
9. Add login, link, connected/offline, membership, and scope-mismatch UX.
10. Point the Hono diagnostic service at the same committed SQL functions.
11. Add real Neon branch two-user/two-scope isolation and concurrency tests.
12. Update release variables and operator runbooks.
13. Run combined verification, migrate both branches intentionally, and publish one signed combined release.

## Self-review

- Read the Track B design brief before repository exploration.
- Inspected the current `SyncApiClient`, `SyncEngine`, runner, outbox/cursor repositories, backend bootstrap, settings/providers, Hono payload validation, command application, `sync_changes` pull reader, Drizzle schema/migrations, environment validation, and Windows release workflow.
- Compared all three required approaches and gave concrete rejection reasons for both embedded database-credential designs.
- Covered provisioning, public configuration names, desktop login/session/offline restart, push and pull flow, RPC-only choice, per-command atomicity, duplicates, RLS/grants, scope derivation, migration/rollback, local/mock tests, Neon branch integration tests, and Track A release sequencing.
- Added the integration-requested owned origin spike. It expects `http://tauri.localhost` unless runtime evidence differs and blocks implementation unless embedded Neon Auth or a no-client-secret native-safe fallback passes.
- Scanned spec and plan for unfinished markers, incomplete placeholders, contradictions, ambiguous scope selection, and command/interface-name drift.
- Verified required paths and headings, three RPC names, three architecture alternatives, `0003`/`0004+` order, combined-release language, plan skill header, and updated `AGENTS.md` next starting point.
- Ran `git diff --check`; corrected Markdown trailing whitespace before the final artifact commit.

## Concerns and Gates

1. Neon Auth and Data API are Beta. Pin and revalidate the exact SDK/API behavior before implementation and release.
2. The exact production Tauri WebView origin is not yet live-proven against Neon Auth trusted domains/session refresh. Task 2 owns this blocking spike; generic localhost access is prohibited. If embedded auth fails, a device-code or system-browser authorization-code-with-PKCE JWT provider must be proven with Data API JWKS before work continues.
3. PostgreSQL command functions duplicate business semantics that currently live in TypeScript. The final shared command manifest, SQL manifest, local SQL tests, and real branch matrix must stay exhaustive, especially after Track A adds grade/deletion behavior.
4. RLS mistakes are high impact. Public-schema exclusion, forced RLS, minimal grants, composite cross-scope constraints, catalog assertions, Data API Advisors, and two-user negative tests are all release gates.
5. The previously exposed Neon credential must be rotated before any online schema or Auth/Data API provisioning.
6. The Hono service remains diagnostic only; it is not a secure public multi-tenant fallback without a separate authenticated hosting decision.
