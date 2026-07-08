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

## Future Segment Reminders

- Segment 14 desktop updater verification must use ordered pre-release tags for updater smoke testing:
  - Build and install a previous Windows EXE/MSI version that already has updater support.
  - Tag and publish a newer pre-release version, even if it contains no functional changes beyond the version bump needed for the updater feed.
  - Launch the installed previous version, trigger/check for updates, apply the update, and verify the installed app reports the newer version.
  - Keep Neon credentials and GitHub tokens out of the packaged desktop app while testing updater metadata.

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

### Segment 2: Shared Domain Package

- Status: completed on `pre-release`.
- Added shared education stage and grade-level contracts.
- Added `isGradeAllowedForStage(stage, gradeLevel)`.
- Added stage-based book/student issuance matching.
- Added Cairo date/time formatting with `Africa/Cairo`.
- Added exact sync command and sync command result TypeScript contracts.
- Added shared Vitest tests for education, inventory matching, Cairo formatting, and sync command type contracts.
- Verification completed:
  - `npm run test -w @app/shared`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

## Next Segment Starting Point

- Segment 3 should add the desktop i18n foundation.
- Start with dictionary parity tests for English and Arabic before wiring shell strings to translation keys.
