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

`test:e2e` runs the rendered React application against a deterministic development-only backend. It covers student/book CRUD, stock and issuance, Excel download, reversal, sync-conflict acknowledgement, updater interaction, desktop/narrow layouts, Arabic RTL, and Axe accessibility. Install Chromium once on a new Windows machine with:

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

2. Confirm the preview opens as `Student Book Tracker React Preview` and creates `%APPDATA%\com.studentbooktracker.reactdev\student-book-tracker-react.db`; it must not modify the production database.
3. On the fresh preview database, open Students and Books. Neither screen may show a load error.
4. Create a book, add stock, create a student with a different government ID, select that student, issue the book, and open Logs. The book quantity must decrement and both inventory events must appear.
5. Check a book without confirming it, select another student, and confirm the unsaved-selection warning. A zero-stock book must be disabled.
6. Choose a concrete grade group and export the workbook. Confirm its name, book columns, signature column, and Arabic RTL worksheet when Arabic is selected.
7. Disconnect from the sync API, make a local write, then reconnect. Confirm pending commands sync. Verify a rejected stock conflict stays available for review.
8. Switch Arabic/English, resize through the compact rail and labelled bottom-navigation breakpoints, and verify dialogs close with Escape and restore focus.

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
