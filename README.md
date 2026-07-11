# Student Book Tracker

Offline-first Windows desktop app for tracking students, book inventory, issuance logs, Excel exports, and later sync to Neon Postgres.

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

`dev:desktop` now opens the isolated React preview identity and database. The legacy Svelte app remains buildable through `dev:desktop:legacy`; it must not run at the same time as a production-identity React build because both production shells intentionally use the same installed identifier and SQLite file.

## Windows releases

Signed Windows installers and the desktop auto-updater are built through GitHub Actions. See [the release runbook](docs/runbooks/release.md) for the release gate, signing boundary, and updater smoke-test procedure.
