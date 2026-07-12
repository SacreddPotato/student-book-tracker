# Offline-Safe Production Boot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make signed React desktop builds boot and remain locally functional when the sync API URL is missing, then publish and verify `v1.0.1`.

**Architecture:** Runtime configuration treats the sync endpoint as optional and is resolved inside the caught Tauri bootstrap path. A sync-client factory chooses either the existing HTTP client or an explicit unavailable client whose network-style failures drive the existing offline status without modifying queued commands. The release continues to consume only the public `vars.SYNC_API_BASE_URL` value.

**Tech Stack:** React 19, TypeScript, Vitest, TanStack Query, Tauri 2, SQLite, GitHub Actions.

## Global Constraints

- Never compile `DATABASE_URL` or `SYNC_API_SHARED_SECRET` into the desktop.
- Preserve the production identity `com.studentbooktracker.app` and database `student-book-tracker.db`.
- Missing sync configuration must not block SQLite migrations or local workflows.
- Malformed non-empty HTTP configuration must remain an explicit error.
- Do not modify the SQLite/Postgres schema or the preserved Svelte frontend.
- Do not stage the unrelated line-ending-only Tauri schema/Cargo working-tree entries.

---

### Task 1: Optional Runtime Sync Configuration

**Files:**
- Modify: `apps/desktop-react/src/app/runtime-config.test.ts`
- Modify: `apps/desktop-react/src/app/runtime-config.ts`

**Interfaces:**
- Produces: `RuntimeConfig.syncApiBaseUrl: string | null`
- Preserves: `resolveRuntimeConfig(env: Record<string, unknown>): RuntimeConfig`

- [ ] **Step 1: Write the failing production-offline test**

Add a test that calls `resolveRuntimeConfig({ DEV: false, PROD: true, VITE_DESKTOP_PROFILE: "production" })` and expects `syncApiBaseUrl` to be `null`, `databaseUrl` to remain `sqlite:student-book-tracker.db`, and `updaterEnabled` to remain `true`.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts`

Expected: FAIL with `Production builds require VITE_SYNC_API_BASE_URL.`

- [ ] **Step 3: Implement the minimal nullable configuration**

Change the runtime type to `syncApiBaseUrl: string | null`. Normalize missing/blank configuration to `null`, remove the production-only missing-value throw, and retain the HTTP(S) validation for non-null values.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts`

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop-react/src/app/runtime-config.ts apps/desktop-react/src/app/runtime-config.test.ts
git commit -m "fix: allow offline production startup"
```

### Task 2: Explicit Unavailable Sync Client And Caught Bootstrap

**Files:**
- Modify: `apps/desktop-react/src/core/sync/api-client.test.ts`
- Modify: `apps/desktop-react/src/core/sync/api-client.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.ts`

**Interfaces:**
- Produces: `createSyncApiClient(config: { apiBaseUrl: string | null; transportToken: string | null }): SyncApiClient`
- Produces: unavailable `push` and `pull` methods that reject with `TypeError("Sync API is not configured for this build.")`
- Consumes: `resolveRuntimeConfig(import.meta.env)` inside `createTauriBackend()`

- [ ] **Step 1: Write failing client-factory tests**

Add one test proving a configured URL still performs the existing fetch behavior and one test proving a null URL returns a client whose `pull(null)` rejects with the exact network-style `TypeError` without invoking fetch.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm run test -w @app/desktop-react -- src/core/sync/api-client.test.ts`

Expected: FAIL because `createSyncApiClient` does not exist.

- [ ] **Step 3: Implement the factory and lazy runtime resolution**

Keep `FetchSyncApiClient` unchanged for configured URLs. Add the unavailable implementation and factory. In `createTauriBackend()`, call `resolveRuntimeConfig(import.meta.env)` locally and pass its nullable endpoint to the factory; remove the module-level `runtimeConfig` import. This places malformed configuration failures inside the existing `bootstrap().catch(...)` path.

- [ ] **Step 4: Run focused sync/backend tests**

Run: `npm run test -w @app/desktop-react -- src/core/sync/api-client.test.ts src/core/sync/sync-engine.test.ts src/core/backend/tauri-backend.test.ts`

Expected: all tests pass, including offline queue preservation.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop-react/src/core/sync/api-client.ts apps/desktop-react/src/core/sync/api-client.test.ts apps/desktop-react/src/core/backend/tauri-backend.ts
git commit -m "fix: use unavailable client for local-only builds"
```

### Task 3: Packaged Runtime And Full Verification

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Verifies: production Tauri binary built without `VITE_SYNC_API_BASE_URL`
- Verifies: maximized Arabic workspace, SQLite initialization, and offline sync indicator

- [ ] **Step 1: Run the complete automated matrix**

Run:

```powershell
npm run test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test --manifest-path apps/desktop-react/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
```

Expected: every command exits zero.

- [ ] **Step 2: Build an unsigned production executable without a sync URL**

Run with `VITE_SYNC_API_BASE_URL` removed from the process environment:

```powershell
Remove-Item Env:VITE_SYNC_API_BASE_URL -ErrorAction SilentlyContinue
npm run tauri -w @app/desktop-react -- build --no-bundle --config src-tauri/tauri.production.conf.json
```

Expected: `apps/desktop-react/src-tauri/target/release/desktop-react.exe` is produced without requiring an updater signing key.

- [ ] **Step 3: Visually verify the exact binary**

Launch the no-bundle executable, confirm the Arabic maximized React workspace renders instead of white, confirm local database/year setup is reachable, and confirm sync reports offline/unavailable. Close the test binary afterward without touching the installed `v1.0.0` database from another production-identity process.

- [ ] **Step 4: Update and commit the handoff**

Record the root cause, regression tests, full commands, packaged visual verification, GitHub variable rule, and release starting point in `AGENTS.md`.

```powershell
git add AGENTS.md
git commit -m "docs: record offline startup verification"
```

### Task 4: Integrate And Publish v1.0.1

**Files:**
- Modify: `apps/desktop-react/package.json`
- Modify: `package-lock.json`
- Modify after release: `AGENTS.md`

**Interfaces:**
- Produces: annotated tag `v1.0.1`
- Produces: signed NSIS installer, `.exe.sig`, and `latest.json`

- [ ] **Step 1: Set and verify version 1.0.1**

Run:

```powershell
npm version 1.0.1 -w @app/desktop-react --no-git-tag-version
npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts src/core/sync/api-client.test.ts
git add apps/desktop-react/package.json package-lock.json
git commit -m "chore: release v1.0.1"
```

Expected: focused tests pass and only the React package/lock version changes.

- [ ] **Step 2: Merge to main and verify the merged tree**

Switch to `main`, merge `codex/offline-safe-production-boot` with an explicit merge commit, rerun `npm run test`, push `main`, and wait for its Windows CI run to pass.

- [ ] **Step 3: Tag and publish**

Create annotated tag `v1.0.1` on the verified main merge commit and push only the tag. Wait for the signed Windows release workflow to pass.

- [ ] **Step 4: Independently verify release assets**

Download the published EXE, `.sig`, and `latest.json`. Verify ProductVersion/FileVersion `1.0.1`, compare the EXE and manifest SHA-256 values with GitHub asset digests, confirm both Windows updater targets, and confirm `releases/latest/download/latest.json` matches the stable manifest byte-for-byte.

- [ ] **Step 5: Final handoff**

Update `AGENTS.md` with CI/release run IDs and hashes, commit with `[skip ci]`, push `main`, confirm a clean tree, and retain `v1.0.0` unchanged.
