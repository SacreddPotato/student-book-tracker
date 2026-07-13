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
