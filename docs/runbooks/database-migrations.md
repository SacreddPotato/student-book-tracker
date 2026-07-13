# Database migrations and hostless sync role

Use the direct owner `DATABASE_URL` only from `apps/sync-api/.env`, a protected GitHub Secret, or an equivalent operator secret store. It is used for committed Drizzle migrations, catalog verification, and role rotation. Never expose `DATABASE_URL`, `neondb_owner`, a Neon management key, or `SYNC_API_SHARED_SECRET` to Vite or the desktop.

After applying migrations through `0004_hostless_direct_neon_sync`, provision the client login:

```powershell
$env:NEON_SYNC_ROLE_PASSWORD = '<new random password>'
$env:NEON_SYNC_URL_OUTPUT = '.neon-sync-client-url'
npm run db:provision-sync-role -w @app/sync-api
```

The command creates or rotates `student_book_sync_client`, verifies both sync procedures, and proves that table reads/writes, private helpers, schema creation, and role creation are denied. Standard output contains only redacted fingerprints and privilege results. When requested, the restricted pooled URL is written to the ignored operator-selected output path with owner-only file permissions where the platform supports them.

Store that restricted pooled URL as the GitHub Actions Secret `NEON_SYNC_DATABASE_URL`. The signed desktop build deliberately compiles this restricted credential, so it is extractable from an installer by a determined user. The accepted trusted-machine threat model permits that exposure; the role is limited to `sync_api.sync_push(jsonb)` and `sync_api.sync_pull(bigint)` and has no direct table or DDL privileges.

Rotating `student_book_sync_client` invalidates existing installers. Publish a new signed desktop release after replacing `NEON_SYNC_DATABASE_URL`. Owner credential rotation does not require a desktop release because the owner URL is never bundled.

Apply every committed migration intentionally to development first, rehearse on disposable PostgreSQL 17, then dispatch the typed-confirmation production migration workflow. Record only redacted target fingerprints and never paste connection strings into logs, issues, commits, or release notes.

## Neon branch discovery

`NEON_API_KEY` and `NEON_PROJECT_ID` may be stored in the ignored operator file `apps/sync-api/.env`. They are management credentials used by `neonctl` to discover branch IDs, obtain short-lived operator connection strings, and rotate the restricted login; neither value is an application runtime setting. Do not add them to Vite, GitHub repository Variables, logs, or release artifacts.

All installed clients share the same `student_book_sync_client` login and the same global rows. `student_book_sync_runtime` is a `NOLOGIN` PostgreSQL role that owns the `SECURITY DEFINER` functions so clients cannot gain table or DDL privileges; it does not represent a school, user, tenant, or application-data owner.

For the current project, the verified branch targets are:

- production branch `br-round-flower-as37e98s`: owner fingerprint `dbaca31802f5`, restricted fingerprint `8479f751bcff`;
- development branch `br-super-salad-aswaapne`: owner fingerprint `53bd50038a42`, restricted fingerprint `7368381c29be`.

Each target has five Drizzle migrations. Both procedures are owned by `student_book_sync_runtime`; `PUBLIC` has no execution grant; `student_book_sync_client` can execute only `sync_push(jsonb)` and `sync_pull(bigint)`. The post-provision verification must deny direct table access, private-function execution, and schema creation, and must leave cutover rows at zero.

Production automation reads `DATABASE_URL`, `EXPECTED_DATABASE_FINGERPRINT`, and `NEON_SYNC_DATABASE_URL` only from GitHub Actions Secrets. The expected fingerprint identifies the direct owner target, while the desktop release receives only the restricted pooled URL.
