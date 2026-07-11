# Windows release and updater runbook

## Security boundary

The updater uses a public verification key embedded in `apps/desktop-react/src-tauri/tauri.production.conf.json`. Its matching private key is stored only as the GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`; it must be retained for the lifetime of every installed app.

The desktop release workflow receives only that signing key and the optional public `SYNC_API_BASE_URL` repository variable. It must never receive `DATABASE_URL`, `SYNC_API_SHARED_SECRET`, a GitHub personal token, or `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` unless the updater key was actually generated with a password. In particular, do not provide `VITE_SYNC_API_SHARED_SECRET`: `VITE_*` values are compiled into the desktop bundle.

## Normal release

`apps/desktop-react/package.json` is the source of truth for the desktop version; Tauri reads that file through `apps/desktop-react/src-tauri/tauri.conf.json`. The release action builds `apps/desktop-react` with `src-tauri/tauri.production.conf.json`, which preserves the installed identifier `com.studentbooktracker.app`, database file `student-book-tracker.db`, updater key/feed, and passive NSIS behavior.

1. Change the desktop package version to the intended SemVer version and commit it with the release changes.
2. Let the `CI` workflow pass on the source commit.
3. Once `release-windows.yml` is present on the repository default branch, use **Run workflow** and enter that exact version without a `v` prefix.
4. The release workflow repeats the quality gates, creates `v<version>` only after they pass, builds the NSIS Windows installer, signs its updater payload, verifies the draft contains the installer, `.sig`, and `latest.json`, then publishes it.

GitHub only exposes `workflow_dispatch` for workflow files on the default branch. Until this branch is merged into `master`, validate locally and push an annotated `v<version>` tag only after the same checks pass; the tag-triggered workflow will validate before publishing its release.

## Updater smoke test

The production update endpoint is GitHub's `releases/latest/download/latest.json`, which ignores GitHub releases marked as prereleases. For an ordered smoke test, use SemVer prerelease *version strings* such as `0.1.0-demo.1` and `0.1.0-demo.2`, but publish their GitHub releases with `prerelease: false` as this workflow does.

1. Publish and install `v0.1.0-demo.1` from its GitHub release.
2. Publish `v0.1.0-demo.2` with the same application identifier and updater public key.
3. Launch the installed `.1` app, open **Settings**, and choose **Check for updates**. Confirm that `.2` is offered.
4. Choose **Download update**, wait for **ready to install**, then choose **Install update**. Windows exits the app while the installer applies the update; this is expected.
5. Relaunch the installed app and confirm Settings reports `0.1.0-demo.2`.

The updater only checks for availability at startup. It never downloads, installs, or restarts the app until the user explicitly presses the corresponding Settings action.

When an update is available, installed releases also show a global toast over the current workspace section. **View update** opens the Settings update controls; **Dismiss** hides that version's toast for the current session. Neither action starts a download or installation.

## Rollback boundary

The Svelte/Tauri source remains under `apps/desktop` and can be run with `npm run dev:desktop:legacy`. A rollback release requires an intentional workflow change back to that workspace and the same version/signing checks; do not delete or rewrite the React workspace to roll back.

Only one production-identity desktop shell may open `%APPDATA%\com.studentbooktracker.app\student-book-tracker.db` at a time. Never run a legacy production shell and a React production shell concurrently. React preview development is safe because it uses `com.studentbooktracker.reactdev` and `student-book-tracker-react.db`.

Before the first React production release, copy a representative production database to a disposable test profile, launch the React production-identity build against the copy, and compare students, books, quantities, issued rows, logs, settings, outbox statuses, and the sync cursor. Do not perform this rehearsal against the only live database copy.
