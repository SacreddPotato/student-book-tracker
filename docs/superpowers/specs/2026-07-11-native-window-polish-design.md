# Native Window And Startup Polish Design

## Scope

Polish the React/Tauri desktop shell without changing inventory behavior or the preserved Svelte rollback source. The work covers local sync startup ergonomics, native window chrome, initial window/language state, and checkbox indicator geometry.

## Local Sync Development

The configured React and API secrets already match. The observed Offline state was caused by no process listening at the configured local endpoint `http://127.0.0.1:8787`.

Add a root development command that starts the sync API and React/Tauri preview together. Keep `dev:desktop:react` as the UI-only command for cases where the API is already running. Production configuration and remote API behavior remain unchanged. The sync status continues to report Offline for a genuinely unreachable endpoint rather than masking transport failures.

## Native Window Frame

Disable native decorations for the React preview and production window configurations. Render a Tauri-only title bar above the existing shell:

- 38px dark title bar matching the navigation rail.
- One-pixel dark frame around the native webview.
- Product title at the physical left.
- Minimize, maximize/restore, and close actions at the physical right, independent of Arabic RTL direction.
- A broad drag region that excludes the action buttons.
- Close uses a red hover treatment; minimize and maximize use restrained neutral hover states.
- Maximize icon changes to Restore while the window is maximized.

Browser fixture mode does not render custom window chrome, keeping browser E2E behavior deterministic.

Window actions use a small injected adapter around Tauri's current-window API. Unit tests verify minimize, toggle-maximize, and close calls plus maximize-state updates. A real Tauri smoke test verifies startup maximization and each visible action.

## Startup Defaults

Both preview and production Tauri windows start maximized. The React provider defaults to Arabic, immediately applying `lang="ar"` and `dir="rtl"`. English-focused component and E2E tests opt into English explicitly so their assertions remain intentional.

## Checkbox Geometry

Keep the existing 20px checkbox and 44px row target. Make the Radix indicator fill the checkbox and use grid centering so the SVG checkmark is centered on both axes in English and Arabic.

## Verification

- Unit tests for native window actions and Arabic default state.
- Existing Students tests plus an explicit centered-indicator DOM contract.
- Full React tests, rendered Playwright journeys, typecheck, and build.
- Cargo check for the React shell.
- Real Tauri smoke: maximized startup, minimize/restore, maximize/restore, close, Arabic initial view, and successful authenticated sync while the combined development command is running.

## Safety And Rollback

Only `apps/desktop-react` and root development scripts change. `apps/desktop` remains intact. Production identifier, database path, updater key/feed, and signing boundary are unchanged.
