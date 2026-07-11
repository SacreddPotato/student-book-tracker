# Student Book Tracker

Offline-first Windows desktop app for tracking students, semester book inventory, academic-year records, issuance logs, Excel exports, and Neon Postgres synchronization.

## Workspace

- `apps/desktop-react`: production-target React 19, Vite, and Tauri 2 desktop app.
- `apps/desktop`: preserved SvelteKit/Tauri rollback frontend.
- `apps/sync-api`: Hono sync API for remote persistence.
- `packages/shared`: Shared TypeScript contracts and domain helpers.

## Scripts

```sh
npm run dev:desktop
npm run dev:desktop:react
npm run dev:desktop:legacy
npm run dev:api
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

`dev:desktop` starts both the local sync API and the isolated React/Tauri preview so local sync does not remain Offline merely because the API process was omitted. Use `dev:desktop:react` when the API is already running separately. The legacy Svelte app remains buildable through `dev:desktop:legacy`; it must not run at the same time as a production-identity React build because both production shells intentionally use the same installed identifier and SQLite file.

## Neon development and production branches

The sync API reads `DATABASE_URL` and `SYNC_API_SHARED_SECRET` from the untracked `apps/sync-api/.env`. The desktop never receives the Neon database URL. Keep one Neon branch for development/testing and a separate production branch.

To switch safely:

1. Stop `dev:api`/`dev:desktop` so no sync process is using the previous database.
2. Back up the current untracked `.env`, then replace only `DATABASE_URL` with the target Neon branch connection string. Keep the matching server-side shared secret in the same file.
3. Run `npm run db:migrate -w @app/sync-api` and verify it finishes against the intended branch.
4. Start `npm run dev:api`, verify `GET /health`, then start the desktop or use `npm run dev:desktop`.

Never copy `DATABASE_URL`, a Neon credential, or `SYNC_API_SHARED_SECRET` into a `VITE_*` variable, Tauri configuration, committed file, or packaged desktop build. See [the verification runbook](docs/runbooks/verification.md) for the branch-switch checklist.

## Windows releases

Each successful non-bot push to `pre-release` is assigned the next ordered `0.1.0-demo.N` version, tagged, and passed to the signed Windows release workflow. See [the release runbook](docs/runbooks/release.md) for the release gate, signing boundary, and updater smoke-test procedure.
