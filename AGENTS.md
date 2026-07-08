# AGENTS.md

## Segment Handoff Rule

Update this file at the end of every completed implementation segment. Keep the latest segment status, verification commands, known environment notes, and next-segment starting point current.

## Project Context

- Goal: Windows-first offline desktop app for student and book inventory tracking.
- Monorepo workspaces:
  - `apps/desktop`: Tauri 2 + SvelteKit desktop app.
  - `apps/sync-api`: Hono sync API.
  - `packages/shared`: shared TypeScript contracts and domain helpers.
- Desktop frontend uses SvelteKit static output through `@sveltejs/adapter-static` for Tauri packaging.

## Current Branch

- Segment work is happening on `pre-release`.

## Segment Status

### Segment 1: Workspace Skeleton

- Status: completed on `pre-release`.
- Root npm workspaces are configured for `apps/*` and `packages/*`.
- Desktop scaffold is Tauri 2 + SvelteKit with static adapter output.
- Desktop shell has primary tabs for Students, Books, and Logs.
- Sync API and shared package skeletons are present.
- Added `README.md`.
- Added a desktop Vitest contract test for the Segment 1 tab order.
- Verification completed:
  - `npm install`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run dev:desktop` with `%USERPROFILE%\.cargo\bin` prepended to PATH
- Environment note: Rust exists at `%USERPROFILE%\.cargo\bin`, but the current shell PATH may need that directory prepended before running Tauri commands.

## Next Segment Starting Point

- Segment 2 should add shared domain contracts in `packages/shared`.
- Start with tests for education stages, inventory matching, and Cairo time formatting before implementation.
