# MVP verification runbook

## Automated checks

Run these from the repository root before merging a desktop change:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e -w @app/desktop
npm run build
```

`test:e2e` runs the Segment 16 workflow specifications with Playwright's test runner. They cover the local stock-and-issue workflow, offline queue recovery/rejection handling, and Arabic workbook output. Install the Playwright browser runtime once on a new Windows machine with:

```sh
npx playwright install chromium
```

The ordinary Vite browser preview is not a valid local-persistence acceptance test: it has no Tauri SQL bridge. Use a Tauri desktop build for every SQLite verification.

## Tauri desktop smoke test

1. Start the app with `%USERPROFILE%\.cargo\bin` prepended to `PATH`:

   ```powershell
   $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
   npm run tauri -w @app/desktop -- dev
   ```

2. On a fresh local database, open Students and Books. Neither screen may show a load error.
3. Create a book, add stock, create a student with a different government ID, select that student, issue the book, and open Logs. The book quantity must decrement and both inventory events must appear.
4. Check a book without confirming it, select another student, and confirm the unsaved-selection warning. A zero-stock book must be disabled.
5. Choose a concrete grade group and export the workbook. Confirm its name, book columns, signature column, and Arabic RTL worksheet when Arabic is selected.
6. Disconnect from the sync API, make a local write, then reconnect. Confirm pending commands sync. Verify a rejected stock conflict stays available for review.

## Packaged Windows smoke test

Use a signed installer or a local package built from the exact commit under test. For the published updater verification baseline, install [v0.1.0-demo.4](https://github.com/SacreddPotato/student-book-tracker/releases/tag/v0.1.0-demo.4).

- Confirm startup creates or migrates `%APPDATA%\com.studentbooktracker.app\student-book-tracker.db` with the local schema.
- Confirm Students and Books load successfully and support creation without an internet connection.
- Confirm Settings shows the app version and the expected update state. Local development must keep updater checks disabled.
- Do not place Neon URLs, shared sync secrets, GitHub tokens, or updater private keys in the packaged app.
