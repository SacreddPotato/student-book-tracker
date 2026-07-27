# MVP verification runbook

## Automated checks

Run these from the repository root before merging a desktop change:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

`test:e2e` runs the rendered React application against a deterministic development-only backend. It covers first-run academic-year setup, promotion/read-only archives, student/book CRUD, both semester balances and receipt metadata, mixed-semester issuance, Excel download, reversal, sync-conflict acknowledgement, updater interaction, desktop/narrow layouts, Arabic RTL, and Axe accessibility. Install Chromium once on a new Windows machine with:

```sh
npx playwright install chromium
```

The ordinary Vite browser preview is not a valid local-persistence acceptance test: it has no Tauri SQL bridge. Use a Tauri desktop build for every SQLite verification.

## Tauri desktop smoke test

1. Start the app with `%USERPROFILE%\.cargo\bin` prepended to `PATH`:

   ```powershell
   $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
   npm run dev:desktop
   ```

   This command starts both the local sync API and the React/Tauri preview. Use
   `npm run dev:desktop:react` only when the API is already running separately.

2. Confirm the preview opens maximized, in Arabic/RTL, with the dark custom title bar and creates `%APPDATA%\com.studentbooktracker.reactdev\student-book-tracker-react.db`; it must not modify the production database.
3. Confirm sync reaches `Synced`. Exercise the custom minimize, restore/maximize, and close controls in the real Tauri window, then relaunch before continuing.
4. On the fresh preview database, enter an academic year such as `2025-2026`. The workspace must remain blocked until a valid consecutive-year value is saved.
5. Create a book. Add first- and second-semester stock separately; each stock action must require quantity, issue receipt number, and receipt date. Confirm Logs preserves the semester and receipt metadata.
6. Create a student with a different government ID, open a subject disclosure, select one or both semester rows, and confirm issuance. Only the selected semester balances may decrement.
7. Check a semester without confirming it, verify the checkmark is centered, select another student, and confirm the unsaved-selection warning. A zero-stock semester must be disabled.
8. Choose a concrete grade group and export the workbook. Per subject, confirm `0`, `1`, or `2`; also confirm the signature column and Arabic RTL worksheet.
9. In Settings, advance only to the exact successor after typing the target year. Confirm students are promoted, Preparatory 3 students are not copied forward, new-year issuances/logs are empty, book balances are unchanged, and the prior year remains selectable with no edit/issue/reverse actions.
10. Disconnect from the sync API, make a local write, then reconnect. Confirm pending commands sync. Verify a rejected stock conflict identifies the subject semester and stays available for review.
11. Switch Arabic/English, resize through the compact rail and labelled bottom-navigation breakpoints, and verify dialogs close with Escape and restore focus.

## Switching the Neon branch

1. Stop all local sync API and desktop processes.
2. Confirm `apps/sync-api/.env` is untracked. Record whether its `DATABASE_URL` currently targets the development/testing or production Neon branch without printing the credential.
3. Replace `DATABASE_URL` with the intended branch connection string and keep the server-only shared secret alongside it.
4. Run `npm run db:migrate -w @app/sync-api`.
5. Start `npm run dev:api`, request `http://127.0.0.1:8787/health`, and confirm the response is healthy.
6. Run the sync API tests, then the desktop sync tests. Never point two concurrently running API processes at different branches while using the same desktop database.

## Packaged Windows smoke test

Use a signed installer or a local package built from the exact commit under test. For the published updater verification baseline, install [v0.1.0-demo.4](https://github.com/SacreddPotato/student-book-tracker/releases/tag/v0.1.0-demo.4).

- Confirm startup creates or migrates `%APPDATA%\com.studentbooktracker.app\student-book-tracker.db` with the local schema.
- Confirm Students and Books load successfully and support creation without an internet connection.
- Confirm Settings shows the app version and the expected update state. Local development must keep updater checks disabled.
- Do not place Neon URLs, shared sync secrets, GitHub tokens, or updater private keys in the packaged app.

## Legacy rollback verification

The preserved Svelte workspace remains a source rollback, not the default development target:

```powershell
npm run test -w @app/desktop
npm run build -w @app/desktop
npm run dev:desktop:legacy
```

Never run a legacy production-identity build concurrently with a React production-identity build. Both intentionally resolve to the same installed app directory and production SQLite file.
