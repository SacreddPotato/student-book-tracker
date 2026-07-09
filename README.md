# Student Book Tracker

Offline-first Windows desktop app for tracking students, book inventory, issuance logs, Excel exports, and later sync to Neon Postgres.

## Workspace

- `apps/desktop`: Tauri 2 and SvelteKit desktop app.
- `apps/sync-api`: Hono sync API for remote persistence.
- `packages/shared`: Shared TypeScript contracts and domain helpers.

## Scripts

```sh
npm run dev:desktop
npm run dev:api
npm run build
npm run lint
npm run typecheck
npm run test
```

Desktop builds use SvelteKit static output so Tauri can package the frontend from `apps/desktop/build`.

## Windows releases

Signed Windows installers and the desktop auto-updater are built through GitHub Actions. See [the release runbook](docs/runbooks/release.md) for the release gate, signing boundary, and updater smoke-test procedure.
