# Offline-Safe Production Boot And v1.0.1 Design

## Problem

The signed `v1.0.0` desktop opens to a blank WebView when the release build does not receive `VITE_SYNC_API_BASE_URL`. Production runtime configuration currently throws while its module is being evaluated, before React installs its startup error handler. The release workflow reads `vars.SYNC_API_BASE_URL`, while the configured value currently exists under GitHub Secrets.

## Approved Outcome

The desktop must always boot into its local SQLite workspace when no sync API URL is configured. It must report sync as unavailable/offline, preserve pending outbox commands, and remain fully usable locally. A configured HTTP(S) URL must continue to enable the fetch sync client. A malformed non-empty URL remains a configuration error, but it must surface as readable startup text instead of a blank page.

## Design

1. Change `RuntimeConfig.syncApiBaseUrl` to `string | null`. Missing production configuration resolves to `null`; non-empty values retain HTTP(S) validation.
2. Resolve runtime configuration inside `createTauriBackend()` rather than through a throwing module-level constant. This keeps configuration failures within the existing `bootstrap().catch(...)` boundary.
3. Add a sync-client factory. It returns `FetchSyncApiClient` for a configured URL and an explicit unavailable client otherwise. The unavailable client rejects with a network-style `TypeError`, allowing the existing sync engine to enter its offline phase without changing local data or rejecting queued commands.
4. Update the release workflow to prefer `vars.SYNC_API_BASE_URL` and fall back to `secrets.SYNC_API_BASE_URL`. The URL is public after compilation; neither `DATABASE_URL` nor `SYNC_API_SHARED_SECRET` may be passed to Vite.
5. Release the verified patch as `v1.0.1` without rewriting `v1.0.0`.

## Verification

- Regression tests prove a production profile without a URL resolves successfully to local-only mode.
- Sync client tests prove the unavailable client reports a network failure without making a request.
- Existing malformed-URL and production-identity tests remain green.
- Run the full unit, rendered Chromium, typecheck, lint, build, Cargo test, and Cargo check gates.
- Build the production Tauri executable with no API URL and visually verify that the Arabic maximized workspace renders instead of a white page and shows offline sync.
- Push the branch, verify Windows CI, tag `v1.0.1`, verify the signed EXE, signature, updater manifest, and global latest feed.

## Non-Goals

- Do not bundle the sync API shared secret or any Neon/database credential.
- Do not redesign server authentication in this patch.
- Do not alter SQLite schemas, academic-year behavior, inventory behavior, or the preserved Svelte rollback frontend.
