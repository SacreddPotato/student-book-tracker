# Native Window And Startup Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable combined local sync startup, Tauri-only dark custom window chrome, maximized/Arabic startup defaults, and a centered student-book checkbox indicator.

**Architecture:** Keep browser and native concerns separated. Root scripts orchestrate the two local services; a small injected `WindowControls` adapter isolates Tauri APIs from a testable React title bar; Tauri configuration owns decoration/maximization defaults; providers own language defaults; CSS owns checkbox geometry.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Tauri 2, Radix Checkbox, Lucide React, Vitest, React Testing Library, Playwright, concurrently.

## Global Constraints

- Only `apps/desktop-react` and root development scripts change; preserve `apps/desktop` untouched.
- Preview and production keep their existing identifiers, SQLite filenames, updater feed/key, and signing boundary.
- Custom title bar renders only when `isTauri()` is true.
- Native action buttons remain on the physical right in both English and Arabic.
- Local API transport errors remain visible as Offline; do not convert failures to Synced.
- Execute inline to honor the user's token-usage preference.

---

### Task 1: Start the local sync API with the default desktop command

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/desktop-react/src/app/runtime-config.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: root `dev:desktop` running API and React/Tauri concurrently.
- Preserves: `dev:desktop:react` as UI-only and `dev:api` as API-only.

- [ ] **Step 1: Add a failing root-script contract test**

Read the root package from `runtime-config.test.ts` and assert:

```ts
expect(rootPackage.scripts["dev:desktop"]).toContain("concurrently");
expect(rootPackage.scripts["dev:desktop"]).toContain("dev:api");
expect(rootPackage.scripts["dev:desktop"]).toContain("dev:desktop:react");
```

- [ ] **Step 2: Run the contract and observe RED**

Run: `npx vitest run src/app/runtime-config.test.ts --reporter=verbose`

Expected: failure because `dev:desktop` currently starts only Tauri.

- [ ] **Step 3: Install and configure orchestration**

Add root `concurrently` and set:

```json
{
  "scripts": {
    "dev:desktop": "concurrently --kill-others --names api,desktop \"npm run dev:api\" \"npm run dev:desktop:react\"",
    "dev:desktop:react": "npm run tauri -w @app/desktop-react -- dev"
  },
  "devDependencies": {
    "concurrently": "^9.2.1"
  }
}
```

Document the combined and UI-only commands in `README.md`.

- [ ] **Step 4: Verify authenticated local transport**

Run `npm run dev:desktop`, wait for ports `8787` and `1430`, then request `/health` and `/sync/pull?since=0` with the configured header without printing the secret.

Expected: both return HTTP 200 and the desktop sync status leaves Offline.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json README.md apps/desktop-react/src/app/runtime-config.test.ts
git commit -m "fix: start local sync with React desktop"
```

### Task 2: Add the dark native title bar and window actions

**Files:**
- Create: `apps/desktop-react/src/components/shell/window-controls.ts`
- Create: `apps/desktop-react/src/components/shell/NativeTitleBar.tsx`
- Create: `apps/desktop-react/src/components/shell/NativeTitleBar.test.tsx`
- Modify: `apps/desktop-react/src/components/shell/AppShell.tsx`
- Modify: `apps/desktop-react/src/styles/shell.css`
- Modify: `apps/desktop-react/src-tauri/tauri.conf.json`
- Modify: `apps/desktop-react/src-tauri/tauri.production.conf.json`
- Modify: `apps/desktop-react/src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: `WindowControls { minimize, toggleMaximize, close, isMaximized, onResized }`.
- Produces: `NativeTitleBar({ controls? })` with injectable controls for tests.

- [ ] **Step 1: Write failing native-control tests**

Create a fake `WindowControls`, render the component, click its three labelled buttons, and assert each adapter method is called once. Start `isMaximized()` as true and assert the maximize button is labelled `Restore`; fire the resize listener after changing it to false and assert the label becomes `Maximize`.

- [ ] **Step 2: Run the test and observe RED**

Run: `npx vitest run src/components/shell/NativeTitleBar.test.tsx --reporter=verbose`

Expected: import failure because the title bar does not exist.

- [ ] **Step 3: Implement the adapter and component**

The production adapter wraps `getCurrentWindow()`:

```ts
export async function createTauriWindowControls(): Promise<WindowControls> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const window = getCurrentWindow();
  return {
    minimize: () => window.minimize(),
    toggleMaximize: () => window.toggleMaximize(),
    close: () => window.close(),
    isMaximized: () => window.isMaximized(),
    onResized: (listener) => window.onResized(listener),
  };
}
```

Render `Minus`, `Square`/`Copy`, and `X` Lucide icons with explicit localized aria labels. The containing title bar uses `data-tauri-drag-region` and `dir="ltr"` so the action cluster stays physically right.

- [ ] **Step 4: Mount and style the native frame**

`AppShell` wraps its existing shell in `.app-frame`, renders the title bar only for Tauri, and sets `data-native-window`. Add a 38px `#13271d` title bar, one-pixel `#0d1d15` border, neutral action hover states, and red close hover. Native frame content uses `calc(100vh - 38px)` without horizontal or vertical overflow.

- [ ] **Step 5: Configure frameless maximized windows and permissions**

Set both window configurations to:

```json
{
  "decorations": false,
  "maximized": true
}
```

Grant:

```json
"core:window:allow-minimize",
"core:window:allow-toggle-maximize",
"core:window:allow-is-maximized",
"core:window:allow-close",
"core:window:allow-start-dragging"
```

- [ ] **Step 6: Verify and commit**

Run the focused title-bar and shell tests, `npm run typecheck -w @app/desktop-react`, and Cargo check.

```powershell
git add apps/desktop-react/src/components/shell apps/desktop-react/src/styles/shell.css apps/desktop-react/src-tauri
git commit -m "feat: add dark native window chrome"
```

### Task 3: Default to Arabic and center checkbox indicators

**Files:**
- Modify: `apps/desktop-react/src/app/AppProviders.tsx`
- Modify: React component test render helpers using `AppProviders`
- Modify: `apps/desktop-react/tests/e2e/app-fixture.ts`
- Modify: `apps/desktop-react/src/styles/primitives.css`
- Modify: `apps/desktop-react/src/components/ui/ui-primitives.test.tsx`

**Interfaces:**
- Changes: `AppProviders` default `initialLanguage` from `"en"` to `"ar"`.
- Preserves: tests can request `initialLanguage="en"` explicitly.

- [ ] **Step 1: Write failing Arabic-default and checkbox tests**

Add a provider test asserting an omitted `initialLanguage` applies `lang="ar"` and `dir="rtl"`. Render `Checkbox` and assert its Radix indicator has class `ui-checkbox-indicator`.

- [ ] **Step 2: Run focused tests and observe RED**

Expected: the provider defaults to English and the indicator class is missing.

- [ ] **Step 3: Implement the defaults and geometry**

Set `initialLanguage = "ar"`. Add the indicator class in `Checkbox.tsx` and style it:

```css
.ui-checkbox-indicator {
  inline-size: 100%;
  block-size: 100%;
  display: grid;
  place-items: center;
  line-height: 0;
}
```

Set English-focused tests to `initialLanguage="en"`. In `openFixture`, click the stable `EN` button before using English selectors.

- [ ] **Step 4: Verify and commit**

Run the provider, primitive, Students, shell, and E2E tests.

```powershell
git add apps/desktop-react/src apps/desktop-react/tests/e2e
git commit -m "fix: polish Arabic startup and checkbox alignment"
```

### Task 4: Native smoke and final handoff

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/runbooks/verification.md`

**Interfaces:**
- Produces: verified native action behavior and updated segment handoff.

- [ ] **Step 1: Run automated gates**

Run sequentially:

```powershell
npm run test -w @app/desktop-react
npm run test:e2e -w @app/desktop-react
npm run typecheck -w @app/desktop-react
npm run build -w @app/desktop-react
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
```

- [ ] **Step 2: Run the real Tauri smoke test**

Start `npm run dev:desktop`, confirm Arabic and maximized startup, then exercise maximize/restore, minimize/restore, and close. Confirm the dark frame stays flush at desktop edges and the sync status reaches Synced while `/health` and authenticated pull return 200.

- [ ] **Step 3: Update handoff documentation**

Record exact commands, native results, API process behavior, and the next starting point in `AGENTS.md` and `docs/runbooks/verification.md`.

- [ ] **Step 4: Commit**

```powershell
git add AGENTS.md docs/runbooks/verification.md
git commit -m "docs: record native window verification"
```
