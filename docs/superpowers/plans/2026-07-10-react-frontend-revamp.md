# React Frontend Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and release a complete React/Tauri replacement frontend with improved interaction design and full MVP parity while retaining the Svelte application as a buildable rollback source.

**Architecture:** Add an isolated `apps/desktop-react` workspace containing framework-neutral desktop core modules, injected runtime adapters, TanStack Query feature state, and a Radix-backed React design system. Develop against a preview Tauri identity/database, then switch the existing Windows release workflow to a production overlay that preserves the installed identifier, SQLite path, updater feed, and signing boundary.

**Tech Stack:** React 19.2.7, TypeScript 7.0.2, Vite 8.1.4, Tauri 2.11.x, TanStack Query 5.101.2, Radix Primitives 1.6.2, Lucide React 1.24.0, Vitest 4.1.10, React Testing Library 16.3.2, Playwright 1.61.1, Axe Playwright 4.12.1, ExcelJS 4.4.0, SQLite.

## Global Constraints

- Preserve `apps/desktop` and keep its current tests/build green; do not import from its `$lib` source in the React workspace.
- Use `@app/shared` as the cross-workspace domain/protocol boundary.
- Preview identity is `com.studentbooktracker.reactdev`, product name is `Student Book Tracker React Preview`, and database filename is `student-book-tracker-react.db`.
- Production identity remains `com.studentbooktracker.app`, product name remains `Student Book Tracker`, and database filename remains `student-book-tracker.db`.
- Preview uses Vite ports `1430/1431`, output directory `dist`, and no updater endpoint.
- Production retains the current updater public key, GitHub `latest.json` endpoint, passive NSIS behavior, and GitHub-only `TAURI_SIGNING_PRIVATE_KEY` boundary.
- Never package a remote database URL, Neon credential, GitHub token, signing key, or production sync shared secret.
- English and Arabic dictionaries must have exact key parity; `lang`, `dir`, Cairo time, localized numbers, and RTL geometry must be correct.
- SQLite is authoritative. TanStack Query may cache reads but may not become a second persistence layer.
- Local writes remain serialized, enqueue outbox commands atomically, request coalesced sync, prevent duplicate submission, and preserve user input on failure.
- Control heights are 40 to 42px; checkboxes are 20px inside at least 44px rows; table cells use 12px block and 16px inline padding; action groups use an 8px gap.
- Red is reserved for destructive/blocking actions. Positive confirmations use the primary intent.
- Dialogs and sheets trap focus, support safe Escape closure, restore trigger focus, inert the background, and respect reduced motion.
- Execute primarily inline with superpowers:executing-plans. Use at most one focused final review subagent unless unrelated failures justify an independent investigation.

---

## Planned File Structure

`apps/desktop-react/src/core` contains framework-neutral configuration, persistence, repositories, use cases, sync, updater, export, i18n, and backend contracts. `src/app` contains React providers, query configuration, navigation, notices, and lifecycle. `src/components/ui` contains accessible primitives with owned styling. `src/features` contains Students, Books, Logs, Settings, and Sync feature modules. `src/styles` contains semantic tokens and shared layout rules. `tests/e2e` contains real rendered UI journeys against a deterministic browser backend. `src-tauri` contains the isolated preview shell plus the production overlay.

### Task 1: Scaffold the React workspace and safe Tauri profiles

**Files:**
- Create: `apps/desktop-react/package.json`
- Create: `apps/desktop-react/tsconfig.json`
- Create: `apps/desktop-react/vite.config.ts`
- Create: `apps/desktop-react/index.html`
- Create: `apps/desktop-react/.env.example`
- Create: `apps/desktop-react/.env.production-release`
- Create: `apps/desktop-react/src/vite-env.d.ts`
- Create: `apps/desktop-react/src/main.tsx`
- Create: `apps/desktop-react/src/app/runtime-config.ts`
- Create: `apps/desktop-react/src/app/runtime-config.test.ts`
- Create: `apps/desktop-react/src/test/setup.ts`
- Create: `apps/desktop-react/src-tauri/Cargo.toml`
- Create: `apps/desktop-react/src-tauri/build.rs`
- Create: `apps/desktop-react/src-tauri/src/main.rs`
- Create: `apps/desktop-react/src-tauri/src/lib.rs`
- Create: `apps/desktop-react/src-tauri/capabilities/default.json`
- Create: `apps/desktop-react/src-tauri/tauri.conf.json`
- Create: `apps/desktop-react/src-tauri/tauri.production.conf.json`
- Copy: `apps/desktop/src-tauri/icons/*` to `apps/desktop-react/src-tauri/icons/*`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `DesktopProfile = "preview" | "production"`.
- Produces: `RuntimeConfig { profile, databaseUrl, databaseFile, syncApiBaseUrl, syncApiSharedSecret, updaterEnabled }`.
- Produces: Tauri command `execute_local_transaction(databaseFile, statements)` restricted to the two approved filenames.

- [ ] **Step 1: Write the failing runtime-profile contract test**

```ts
import { describe, expect, it } from "vitest";

import productionTauri from "../../src-tauri/tauri.production.conf.json";
import previewTauri from "../../src-tauri/tauri.conf.json";
import { resolveRuntimeConfig } from "./runtime-config";

describe("resolveRuntimeConfig", () => {
  it("isolates preview identity and database", () => {
    const config = resolveRuntimeConfig({ DEV: true, PROD: false });
    expect(config.profile).toBe("preview");
    expect(config.databaseUrl).toBe("sqlite:student-book-tracker-react.db");
    expect(config.updaterEnabled).toBe(false);
    expect(previewTauri.identifier).toBe("com.studentbooktracker.reactdev");
  });

  it("preserves production identity, database, and updater", () => {
    const config = resolveRuntimeConfig({
      DEV: false,
      PROD: true,
      VITE_DESKTOP_PROFILE: "production",
      VITE_SYNC_API_BASE_URL: "https://sync.example.test",
    });
    expect(config.databaseUrl).toBe("sqlite:student-book-tracker.db");
    expect(config.updaterEnabled).toBe(true);
    expect(productionTauri.identifier).toBe("com.studentbooktracker.app");
  });

  it("rejects a production database URL or unknown profile", () => {
    expect(() => resolveRuntimeConfig({
      DEV: false,
      PROD: true,
      VITE_DESKTOP_PROFILE: "other",
    })).toThrow("Unknown desktop profile");
    expect(() => resolveRuntimeConfig({
      DEV: false,
      PROD: true,
      VITE_DESKTOP_PROFILE: "production",
      VITE_SYNC_API_BASE_URL: "postgresql://secret",
    })).toThrow("HTTP or HTTPS");
  });
});
```

- [ ] **Step 2: Run the test and confirm the workspace does not exist yet**

Run: `npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts`

Expected: npm reports that workspace `@app/desktop-react` is not present.

- [ ] **Step 3: Add the package, TypeScript, Vite, and test configuration**

Use this package contract:

```json
{
  "name": "@app/desktop-react",
  "version": "0.1.0-demo.5",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run typecheck && vite build",
    "build:production": "npm run typecheck && vite build --mode production-release",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "test": "npm run typecheck && vitest run",
    "test:e2e": "playwright test",
    "tauri": "tauri",
    "tauri:build:production": "tauri build --config src-tauri/tauri.production.conf.json"
  },
  "dependencies": {
    "@app/shared": "0.1.0",
    "@tanstack/react-query": "^5.101.2",
    "@tauri-apps/api": "^2.11.1",
    "@tauri-apps/plugin-opener": "^2.5.4",
    "@tauri-apps/plugin-sql": "^2.4.0",
    "@tauri-apps/plugin-updater": "^2.10.1",
    "exceljs": "^4.4.0",
    "lucide-react": "^1.24.0",
    "radix-ui": "^1.6.2",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.12.1",
    "@playwright/test": "^1.61.1",
    "@tauri-apps/cli": "^2.11.4",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.3",
    "jsdom": "^29.1.1",
    "typescript": "~7.0.2",
    "vite": "^8.1.4",
    "vitest": "^4.1.10"
  }
}
```

Configure Vite with React, port `1430`, HMR `1431`, strict port use, Tauri host support, `dist`, and Vitest `jsdom` with `src/test/setup.ts`.

- [ ] **Step 4: Implement the validated runtime configuration**

```ts
export type DesktopProfile = "preview" | "production";

export type RuntimeConfig = {
  profile: DesktopProfile;
  databaseUrl: string;
  databaseFile: string;
  syncApiBaseUrl: string;
  syncApiSharedSecret?: string;
  updaterEnabled: boolean;
};

export function resolveRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  const rawProfile = env.VITE_DESKTOP_PROFILE ?? "preview";
  if (rawProfile !== "preview" && rawProfile !== "production") {
    throw new Error(`Unknown desktop profile: ${String(rawProfile)}`);
  }
  const production = rawProfile === "production";
  const syncApiBaseUrl = String(env.VITE_SYNC_API_BASE_URL ??
    (production ? "" : "http://127.0.0.1:8787"));
  if (production && !syncApiBaseUrl) {
    throw new Error("Production builds require VITE_SYNC_API_BASE_URL.");
  }
  if (syncApiBaseUrl && !/^https?:\/\//.test(syncApiBaseUrl)) {
    throw new Error("Sync API base URL must use HTTP or HTTPS.");
  }
  const databaseFile = production
    ? "student-book-tracker.db"
    : "student-book-tracker-react.db";
  return {
    profile: rawProfile,
    databaseFile,
    databaseUrl: `sqlite:${databaseFile}`,
    syncApiBaseUrl,
    syncApiSharedSecret: env.VITE_SYNC_API_SHARED_SECRET
      ? String(env.VITE_SYNC_API_SHARED_SECRET)
      : undefined,
    updaterEnabled: production,
  };
}
```

- [ ] **Step 5: Add the preview shell and production overlay**

The base Tauri config must use the preview identifier, `http://localhost:1430`, `../dist`, `sqlite:student-book-tracker-react.db`, and no updater endpoint. The production overlay must override the identifier, product name, SQL preload, `beforeBuildCommand` to `npm run build:production`, updater public key/endpoints, and NSIS updater artifact settings.

The Rust transaction command must validate the filename before opening it:

```rust
fn validate_database_file(database_file: &str) -> Result<&str, String> {
    match database_file {
        "student-book-tracker-react.db" | "student-book-tracker.db" => Ok(database_file),
        _ => Err("Unsupported local database file".to_owned()),
    }
}
```

Register opener, SQL, and updater plugins and grant `sql:allow-execute`, `sql:allow-select`, and updater permissions to window `main`.

- [ ] **Step 6: Install, verify, and commit the scaffold**

Run:

```powershell
npm install
npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts
npm run typecheck -w @app/desktop-react
npm run build -w @app/desktop-react
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
```

Expected: runtime profile tests pass, TypeScript and Vite build pass, and Cargo check completes.

Commit:

```powershell
git add apps/desktop-react package-lock.json
git commit -m "feat: scaffold parallel React desktop"
```

### Task 2: Port SQLite persistence and local inventory use cases

**Files:**
- Create: `apps/desktop-react/src/core/db/types.ts`
- Create: `apps/desktop-react/src/core/db/local-db.ts`
- Create: `apps/desktop-react/src/core/db/local-transaction.ts`
- Create: `apps/desktop-react/src/core/db/schema.ts`
- Create: `apps/desktop-react/src/core/db/migrations.ts`
- Create: `apps/desktop-react/src/core/db/repositories/students.ts`
- Create: `apps/desktop-react/src/core/db/repositories/books.ts`
- Create: `apps/desktop-react/src/core/db/repositories/transactions.ts`
- Create: `apps/desktop-react/src/core/db/repositories/outbox.ts`
- Create: `apps/desktop-react/src/core/db/repositories/sync-state.ts`
- Create: `apps/desktop-react/src/core/db/repositories/settings.ts`
- Create: `apps/desktop-react/src/core/services/entity-service.ts`
- Create: `apps/desktop-react/src/core/services/inventory-service.ts`
- Create: `apps/desktop-react/src/core/db/test-database.ts`
- Create: `apps/desktop-react/src/core/db/persistence.test.ts`
- Create: `apps/desktop-react/src/core/services/inventory-service.test.ts`

**Interfaces:**
- Produces: `SqlDatabase`, `SqlStatement`, `runLocalTransaction`.
- Produces: `saveStudent`, `saveBook`, `addBookStock`, `issueBooksToStudent`, `reverseTransaction`.
- Produces: the exact eight-table schema and indexes documented in `AGENTS.md`.

- [ ] **Step 1: Write failing persistence and workflow tests**

```ts
it("commits a student issue, decrements stock, records issuance, and enqueues sync", async () => {
  const database = createTestDatabase();
  await migrateTestDatabase(database);
  await seedStudentAndBooks(database);
  await issueBooksToStudent(
    { studentId: "student-1", bookIds: ["book-1"] },
    deterministicContext(database),
  );
  expect((await getBookById(database, "book-1"))?.quantity).toBe(1);
  expect(await listActiveStudentBookRows(database, "student-1")).toHaveLength(1);
  expect(await listPendingOutboxRows(database)).toEqual([
    expect.objectContaining({ commandType: "ISSUE_BOOKS_TO_STUDENT" }),
  ]);
});

it("rejects a cross-stage or zero-stock issue before mutation", async () => {
  const database = await seededInventoryDatabase();
  await expect(issueBooksToStudent(
    { studentId: "student-primary", bookIds: ["book-secondary"] },
    deterministicContext(database),
  )).rejects.toThrow("student education stage");
  expect((await getBookById(database, "book-secondary"))?.quantity).toBe(2);
  expect(await listPendingOutboxRows(database)).toHaveLength(0);
});
```

- [ ] **Step 2: Run the targeted tests and confirm missing-module failures**

Run: `npm run test -w @app/desktop-react -- src/core/db/persistence.test.ts src/core/services/inventory-service.test.ts`

Expected: tests fail because the persistence and service modules do not exist.

- [ ] **Step 3: Port the database schema, migrations, repositories, and transaction coordinator**

Use this shared database port:

```ts
export type SqlValue = string | number | null | Uint8Array;
export type SqlStatement = { query: string; values: SqlValue[] };
export type SqlDatabase = {
  execute(sql: string, values?: SqlValue[]): Promise<unknown>;
  select<T>(sql: string, values?: SqlValue[]): Promise<T[]>;
  executeTransaction?(databaseFile: string, statements: SqlStatement[]): Promise<void>;
};
```

`loadLocalDatabase(config)` loads `config.databaseUrl`. Its transaction adapter invokes `execute_local_transaction` with `config.databaseFile` and the ordered statements. Initialization shares one promise and clears it after failure. Port every schema statement, migration, row mapper, sync snapshot upsert, and repository query required by the legacy tests.

- [ ] **Step 4: Port entity saves and inventory workflows with stronger stage validation**

```ts
export async function saveStudent(input: StudentDraft, context: MutationContext): Promise<StudentRow>;
export async function saveBook(input: BookDraft, context: MutationContext): Promise<BookRow>;
export async function addBookStock(input: AddBookStockInput, context: InventoryContext): Promise<InventoryTransactionRow>;
export async function issueBooksToStudent(input: IssueBooksToStudentInput, context: InventoryContext): Promise<InventoryTransactionRow>;
export async function reverseTransaction(input: ReverseTransactionInput, context: InventoryContext): Promise<InventoryTransactionRow>;
```

Entity saves must upsert the row and matching `UPSERT_STUDENT` or `UPSERT_BOOK` outbox command in one serialized transaction. Issuance must reject duplicate IDs, missing rows, zero stock, and any book whose stage differs from the student's stage before creating a transaction.

- [ ] **Step 5: Verify persistence parity and commit**

Run:

```powershell
npm run test -w @app/desktop-react -- src/core/db/persistence.test.ts src/core/services/inventory-service.test.ts
npm run typecheck -w @app/desktop-react
```

Expected: migrations are idempotent; concurrent mutations serialize; all stock, issuance, outbox, reversal, and double-reversal tests pass.

Commit:

```powershell
git add apps/desktop-react/src/core
git commit -m "feat: port React desktop persistence core"
```

### Task 3: Port sync, conflict, updater, export, and backend contracts

**Files:**
- Create: `apps/desktop-react/src/core/state/external-store.ts`
- Create: `apps/desktop-react/src/core/sync/api-client.ts`
- Create: `apps/desktop-react/src/core/sync/sync-engine.ts`
- Create: `apps/desktop-react/src/core/sync/sync-runner.ts`
- Create: `apps/desktop-react/src/core/sync/sync-status.ts`
- Create: `apps/desktop-react/src/core/sync/conflicts.ts`
- Create: `apps/desktop-react/src/core/updater/updater-controller.ts`
- Create: `apps/desktop-react/src/core/export/excel-export.ts`
- Create: `apps/desktop-react/src/core/backend/types.ts`
- Create: `apps/desktop-react/src/core/backend/tauri-backend.ts`
- Create: `apps/desktop-react/src/core/backend/fixture-backend.ts`
- Create: `apps/desktop-react/src/core/sync/sync-engine.test.ts`
- Create: `apps/desktop-react/src/core/sync/conflicts.test.ts`
- Create: `apps/desktop-react/src/core/updater/updater-controller.test.ts`
- Create: `apps/desktop-react/src/core/export/excel-export.test.ts`

**Interfaces:**
- Produces: `ExternalStore<T> { getSnapshot, subscribe, update }`.
- Produces: `AppBackend` consumed by every React feature.
- Produces: `syncStore`, `updaterStore`, `requestSync`, `check/download/install` controllers.

- [ ] **Step 1: Write failing controller and backend contract tests**

```ts
it("keeps offline commands pending and exposes an offline snapshot", async () => {
  const backend = await createTestBackend({ fetch: rejectingFetch });
  await backend.saveBook({ name: "Math", educationStage: "primary" });
  await backend.requestSync();
  expect(backend.syncStore.getSnapshot()).toEqual(expect.objectContaining({
    phase: "offline",
    pendingCount: 1,
  }));
});

it("requires explicit update download and installation", async () => {
  const controller = createUpdaterController(fakeAvailableUpdater());
  await controller.check();
  expect(controller.store.getSnapshot().phase).toBe("available");
  await controller.download();
  expect(controller.store.getSnapshot().phase).toBe("ready");
  await controller.install();
  expect(controller.store.getSnapshot().phase).toBe("installing");
});
```

- [ ] **Step 2: Run tests and confirm missing-module failures**

Run: `npm run test -w @app/desktop-react -- src/core/sync src/core/updater src/core/export`

Expected: tests fail because controllers and backend contracts do not exist.

- [ ] **Step 3: Implement framework-neutral stores, sync, conflicts, updater, and export**

```ts
export type ExternalStore<T> = {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  update(update: Partial<T> | ((current: T) => T)): void;
};

export type AppBackend = {
  initialize(): Promise<void>;
  listStudents(): Promise<StudentRow[]>;
  saveStudent(input: StudentDraft): Promise<StudentRow>;
  listBooks(): Promise<BookRow[]>;
  saveBook(input: BookDraft): Promise<BookRow>;
  listIssuedBooks(studentId: string): Promise<StudentBookRow[]>;
  addStock(input: AddBookStockInput): Promise<void>;
  issueBooks(input: IssueBooksToStudentInput): Promise<void>;
  listLogs(): Promise<LogEntry[]>;
  reverseTransaction(transactionId: string): Promise<void>;
  listConflicts(): Promise<SyncConflict[]>;
  acknowledgeConflict(commandId: string): Promise<void>;
  requestSync(): Promise<void>;
  syncStore: ExternalStore<SyncStatus>;
  updater: UpdaterController;
};
```

The Tauri backend composes SQLite repositories and services. The fixture backend uses deterministic in-memory collections and the same validation rules for rendered browser tests. The sync engine ports reversal target translation, accepted/duplicate/rejected status handling, cursor persistence, and pulled snapshot application. The export builder remains lazy-loadable from the feature.

- [ ] **Step 4: Verify controller parity and commit**

Run:

```powershell
npm run test -w @app/desktop-react -- src/core/sync src/core/updater src/core/export
npm run typecheck -w @app/desktop-react
```

Expected: offline, accepted, rejected, cursor, conflict audit, updater phase, English export, and Arabic RTL export tests pass.

Commit:

```powershell
git add apps/desktop-react/src/core
git commit -m "feat: add React desktop runtime services"
```

### Task 4: Build i18n, app providers, shell, and design-system primitives

**Files:**
- Create: `apps/desktop-react/src/core/i18n/en.ts`
- Create: `apps/desktop-react/src/core/i18n/ar.ts`
- Create: `apps/desktop-react/src/core/i18n/index.ts`
- Create: `apps/desktop-react/src/core/i18n/i18n.test.ts`
- Create: `apps/desktop-react/src/app/AppProviders.tsx`
- Create: `apps/desktop-react/src/app/query-client.ts`
- Create: `apps/desktop-react/src/app/navigation.tsx`
- Create: `apps/desktop-react/src/app/notices.tsx`
- Create: `apps/desktop-react/src/app/use-external-store.ts`
- Create: `apps/desktop-react/src/components/ui/Button.tsx`
- Create: `apps/desktop-react/src/components/ui/Field.tsx`
- Create: `apps/desktop-react/src/components/ui/Select.tsx`
- Create: `apps/desktop-react/src/components/ui/Checkbox.tsx`
- Create: `apps/desktop-react/src/components/ui/Dialog.tsx`
- Create: `apps/desktop-react/src/components/ui/Sheet.tsx`
- Create: `apps/desktop-react/src/components/ui/Badge.tsx`
- Create: `apps/desktop-react/src/components/ui/DataTable.tsx`
- Create: `apps/desktop-react/src/components/ui/Feedback.tsx`
- Create: `apps/desktop-react/src/components/ui/ui-primitives.test.tsx`
- Create: `apps/desktop-react/src/components/shell/AppShell.tsx`
- Create: `apps/desktop-react/src/components/shell/AppShell.test.tsx`
- Create: `apps/desktop-react/src/styles/tokens.css`
- Create: `apps/desktop-react/src/styles/base.css`
- Create: `apps/desktop-react/src/styles/primitives.css`
- Create: `apps/desktop-react/src/styles/shell.css`
- Create: `apps/desktop-react/src/App.tsx`

**Interfaces:**
- Produces: `useI18n`, `useBackend`, `useNavigation`, `useNotices`.
- Produces: shared control components whose props encode intent, size, busy, error, and accessible labels.
- Produces: screens `students | books | logs | settings` with guarded navigation.

- [ ] **Step 1: Write failing i18n, focus, and shell tests**

```tsx
it("updates document language and direction", async () => {
  renderApp();
  await userEvent.click(screen.getByRole("button", { name: "AR" }));
  expect(document.documentElement).toHaveAttribute("lang", "ar");
  expect(document.documentElement).toHaveAttribute("dir", "rtl");
});

it("traps dialog focus, closes on Escape, and restores its trigger", async () => {
  render(<DialogHarness />);
  const trigger = screen.getByRole("button", { name: "Add stock" });
  await userEvent.click(trigger);
  expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});
```

- [ ] **Step 2: Run tests and confirm component failures**

Run: `npm run test -w @app/desktop-react -- src/core/i18n src/components`

Expected: tests fail because providers and primitives do not exist.

- [ ] **Step 3: Port dictionaries and implement providers/navigation**

Keep dictionary nesting and existing user-facing parity keys, then add keys for search, sort, counts, sheets, operation-specific messages, retry, last sync, filters, busy/success states, and responsive labels. Flatten keys at runtime and assert exact English/Arabic parity.

Navigation must expose this contract:

```ts
export type ScreenId = "students" | "books" | "logs" | "settings";
export type NavigationBlocker = (target: ScreenId) => boolean | Promise<boolean>;
export type NavigationController = {
  screen: ScreenId;
  requestScreen(target: ScreenId): Promise<boolean>;
  setBlocker(blocker: NavigationBlocker | null): void;
};
```

- [ ] **Step 4: Implement semantic tokens and accessible primitives**

Declare exact token values for the Global Constraints. Wrap Radix Dialog, AlertDialog, Select, Checkbox, Tooltip, and Popover only where the app needs them. Use native buttons, inputs, labels, and tables elsewhere. Every primitive forwards refs, supports `aria-busy`, and renders visible focus with `:focus-visible`.

- [ ] **Step 5: Implement the responsive shell and verify**

The shell renders labelled wide/compact navigation, labelled bottom navigation at narrow width, a persistent EN/AR toggle, a status-button slot, main content, and a polite global notice region. It uses no custom window actions.

Run:

```powershell
npm run test -w @app/desktop-react -- src/core/i18n src/components
npm run typecheck -w @app/desktop-react
npm run build -w @app/desktop-react
```

Expected: dictionary parity, document direction, dialog focus, intent styling hooks, navigation, and shell tests pass.

Commit:

```powershell
git add apps/desktop-react/src
git commit -m "feat: build React desktop interaction system"
```

### Task 5: Implement the Students workspace and Excel interaction

**Files:**
- Create: `apps/desktop-react/src/features/students/student-queries.ts`
- Create: `apps/desktop-react/src/features/students/StudentsScreen.tsx`
- Create: `apps/desktop-react/src/features/students/StudentTable.tsx`
- Create: `apps/desktop-react/src/features/students/StudentEditorSheet.tsx`
- Create: `apps/desktop-react/src/features/students/StudentIssuancePanel.tsx`
- Create: `apps/desktop-react/src/features/students/DiscardDraftDialog.tsx`
- Create: `apps/desktop-react/src/features/students/StudentsScreen.test.tsx`
- Create: `apps/desktop-react/src/styles/students.css`
- Modify: `apps/desktop-react/src/App.tsx`

**Interfaces:**
- Consumes: `AppBackend`, query client, i18n, navigation blocker, design-system primitives.
- Produces: complete Students parity with search, filters, sorting, stable editor sheet, issuance drafts, and export state.

- [ ] **Step 1: Write failing behavior tests**

Cover create/edit with stage-constrained grades, search/stage/grade filters, selected row state, draft-only checkboxes, issued and zero-stock disabling, confirmed issuance, duplicate-submit prevention, grade-required export, Arabic export, save/issue/export failure retention, student switching guard, screen navigation guard, updater navigation guard, unload guard, and stage-changing edit guard.

```tsx
it("guards a stage-changing edit while issuance drafts exist", async () => {
  renderStudents({ students: [primaryStudent], books: [primaryBook] });
  await selectStudent(primaryStudent.name);
  await userEvent.click(screen.getByRole("checkbox", { name: primaryBook.name }));
  await userEvent.click(screen.getByRole("button", { name: /edit student/i }));
  await chooseStage("Secondary");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent(/discard.*book selection/i);
  expect(fakeBackend.saveStudent).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the targeted test and confirm failure**

Run: `npm run test -w @app/desktop-react -- src/features/students/StudentsScreen.test.tsx`

Expected: module-not-found failure.

- [ ] **Step 3: Implement queries, sheet form, table, issuance, guards, and export**

Use stable query keys:

```ts
export const studentKeys = {
  all: ["students"] as const,
  issued: (studentId: string) => ["students", studentId, "issued"] as const,
};
```

Keep previous query data during refresh. Invalidate `students`, `books`, `logs`, and the selected issued query only after the corresponding committed mutation. Export dynamically imports the Excel module, derives the selected grade's stage, disables duplicate clicks, and announces success or inline failure.

- [ ] **Step 4: Verify Students parity and commit**

Run:

```powershell
npm run test -w @app/desktop-react -- src/features/students/StudentsScreen.test.tsx
npm run typecheck -w @app/desktop-react
```

Expected: every listed Students behavior passes, including focus entry/return and draft guards.

Commit:

```powershell
git add apps/desktop-react/src/features/students apps/desktop-react/src/styles/students.css apps/desktop-react/src/App.tsx
git commit -m "feat: add React Students workspace"
```

### Task 6: Implement the Books workspace

**Files:**
- Create: `apps/desktop-react/src/features/books/book-queries.ts`
- Create: `apps/desktop-react/src/features/books/BooksScreen.tsx`
- Create: `apps/desktop-react/src/features/books/BookTable.tsx`
- Create: `apps/desktop-react/src/features/books/BookEditorSheet.tsx`
- Create: `apps/desktop-react/src/features/books/AddStockDialog.tsx`
- Create: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
- Create: `apps/desktop-react/src/styles/books.css`
- Modify: `apps/desktop-react/src/App.tsx`

**Interfaces:**
- Consumes: `AppBackend`, `bookKeys`, shared sheet/dialog/table primitives.
- Produces: book CRUD, stage/search/sort filtering, zero-stock treatment, and stock mutation parity.

- [ ] **Step 1: Write failing Books behavior tests**

```tsx
it("uses a positive primary action and accepts one stock submission", async () => {
  const backend = renderBooks({ books: [zeroStockBook], delayedAddStock: true });
  await userEvent.click(screen.getByRole("button", { name: /add stock.*math/i }));
  await userEvent.type(screen.getByLabelText(/quantity/i), "4");
  const confirm = screen.getByRole("button", { name: /add stock$/i });
  expect(confirm).toHaveAttribute("data-intent", "primary");
  await userEvent.dblClick(confirm);
  expect(backend.addStock).toHaveBeenCalledTimes(1);
});
```

Also cover create/edit, retained quantity, search/stage/sort, counts, zero-stock row/badge, stable sheet focus, inline failures, retained dialog input, and smooth quantity refresh.

- [ ] **Step 2: Run the targeted test and confirm failure**

Run: `npm run test -w @app/desktop-react -- src/features/books/BooksScreen.test.tsx`

Expected: module-not-found failure.

- [ ] **Step 3: Implement and verify Books**

Use `bookKeys.all = ["books"]`. Mutations call backend methods, request sync inside the backend after committed writes, and invalidate `books` and `logs` as appropriate. The table uses 12px/16px cell spacing and an 8px wrapping action group.

Run:

```powershell
npm run test -w @app/desktop-react -- src/features/books/BooksScreen.test.tsx
npm run typecheck -w @app/desktop-react
```

Expected: all Books behavior, focus, spacing hook, and error-retention tests pass.

Commit:

```powershell
git add apps/desktop-react/src/features/books apps/desktop-react/src/styles/books.css apps/desktop-react/src/App.tsx
git commit -m "feat: add React Books workspace"
```

### Task 7: Implement Logs, reversal, Settings, sync, conflicts, and updater surfaces

**Files:**
- Create: `apps/desktop-react/src/features/logs/log-queries.ts`
- Create: `apps/desktop-react/src/features/logs/LogsScreen.tsx`
- Create: `apps/desktop-react/src/features/logs/LogGroup.tsx`
- Create: `apps/desktop-react/src/features/logs/ReverseTransactionDialog.tsx`
- Create: `apps/desktop-react/src/features/logs/LogsScreen.test.tsx`
- Create: `apps/desktop-react/src/features/settings/SettingsScreen.tsx`
- Create: `apps/desktop-react/src/features/settings/UpdateNotice.tsx`
- Create: `apps/desktop-react/src/features/settings/SettingsScreen.test.tsx`
- Create: `apps/desktop-react/src/features/sync/SyncStatusButton.tsx`
- Create: `apps/desktop-react/src/features/sync/SyncStatusPanel.tsx`
- Create: `apps/desktop-react/src/features/sync/SyncConflictList.tsx`
- Create: `apps/desktop-react/src/features/sync/SyncStatusPanel.test.tsx`
- Create: `apps/desktop-react/src/styles/logs.css`
- Create: `apps/desktop-react/src/styles/status.css`
- Modify: `apps/desktop-react/src/App.tsx`
- Modify: `apps/desktop-react/src/app/AppProviders.tsx`

**Interfaces:**
- Consumes: logs/conflicts backend methods and external sync/updater stores.
- Produces: filtered expandable history, destructive reversal, non-obscuring status details, conflict acknowledgement, and explicit updater flow.

- [ ] **Step 1: Write failing feature tests**

```tsx
it("renders reversal as destructive and refreshes every affected surface", async () => {
  const { backend, queryClient } = renderLogs({ logs: [issueLog] });
  await userEvent.click(screen.getByRole("button", { name: /reverse.*student issue/i }));
  const confirm = screen.getByRole("button", { name: /^reverse$/i });
  expect(confirm).toHaveAttribute("data-intent", "destructive");
  await userEvent.click(confirm);
  expect(backend.reverseTransaction).toHaveBeenCalledWith(issueLog.id);
  expect(queryClient.getQueryState(["logs"])?.isInvalidated).toBe(true);
});

it("acknowledges a conflict without removing its rejected audit row", async () => {
  const backend = renderSyncPanel({ conflicts: [stockConflict] });
  await userEvent.click(screen.getByRole("button", { name: /review sync status/i }));
  await userEvent.click(screen.getByRole("button", { name: /acknowledge/i }));
  expect(backend.acknowledgeConflict).toHaveBeenCalledWith(stockConflict.commandId);
  expect(backend.deleteOutboxRow).toBeUndefined();
});
```

Cover log grouping/items/Cairo time, type/entity/date filters, expanded detail, status badge for already reversed, reversal failure retention, updater disabled/check/available/downloading/ready/installing/failed states, per-version notice dismissal, draft-guarded Settings navigation, sync retry/last-time/pending/error states, resolved conflict context, and conflict-refresh failure count preservation.

- [ ] **Step 2: Run the targeted tests and confirm failures**

Run: `npm run test -w @app/desktop-react -- src/features/logs src/features/settings src/features/sync`

Expected: feature modules are missing.

- [ ] **Step 3: Implement the remaining feature surfaces**

Use `logKeys.all = ["logs"]` and `conflictKeys.all = ["sync-conflicts"]`. Render status inside the shell rather than as fixed overlapping overlays. Use Radix Popover on wide screens and Sheet on narrow screens. Reversal invalidates logs, books, students, and selected issued-book queries. Settings invokes controller methods directly and never downloads or installs without a user action.

- [ ] **Step 4: Verify all React component behavior and commit**

Run:

```powershell
npm run test -w @app/desktop-react
npm run typecheck -w @app/desktop-react
npm run build -w @app/desktop-react
```

Expected: all core and component tests pass; the initial bundle keeps ExcelJS in a lazy chunk.

Commit:

```powershell
git add apps/desktop-react/src
git commit -m "feat: complete React desktop workflows"
```

### Task 8: Add real rendered-UI Playwright and accessibility coverage

**Files:**
- Create: `apps/desktop-react/playwright.config.ts`
- Create: `apps/desktop-react/tests/e2e/app-fixture.ts`
- Create: `apps/desktop-react/tests/e2e/students.spec.ts`
- Create: `apps/desktop-react/tests/e2e/books-logs.spec.ts`
- Create: `apps/desktop-react/tests/e2e/settings-sync.spec.ts`
- Create: `apps/desktop-react/tests/e2e/responsive-rtl-accessibility.spec.ts`
- Modify: `apps/desktop-react/src/main.tsx`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.ts`
- Modify: `apps/desktop-react/src/styles/*.css`

**Interfaces:**
- Produces: deterministic `?runtime=fixture` boot path used only in development/test builds.
- Produces: browser-visible fixture control through seeded query parameters, not a production global API.

- [ ] **Step 1: Write failing Playwright journeys**

```ts
test("keyboard-only student issue and draft guard", async ({ page }) => {
  await page.goto("/?runtime=fixture&seed=inventory");
  await page.getByRole("row", { name: /Amina Hassan/ }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("checkbox", { name: /Arabic Reader/ }).check();
  await page.getByRole("button", { name: /Books/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("checkbox", { name: /Arabic Reader/ })).toBeChecked();
});

test("primary screens have no detectable axe violations", async ({ page }) => {
  await page.goto("/?runtime=fixture&seed=full");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 2: Run Playwright and confirm missing configuration/spec support**

Run: `npm run test:e2e -w @app/desktop-react`

Expected: Playwright fails before the fixture runtime and web server are configured.

- [ ] **Step 3: Implement fixture boot, browser journeys, and responsive refinements**

Configure a single-worker Vite web server on port `1430`. Reject `runtime=fixture` in production builds. Add journeys for CRUD, stock, issuance, reversal, export trigger, offline/rejected sync, conflict acknowledgement, updater notification, English/Arabic, desktop/narrow navigation, sheet/dialog focus, reduced motion, table/card adaptation, and overlay collision.

- [ ] **Step 4: Run component, Playwright, and build gates; inspect the UI**

Run:

```powershell
npm run test -w @app/desktop-react
npm run test:e2e -w @app/desktop-react
npm run typecheck -w @app/desktop-react
npm run build -w @app/desktop-react
```

Expected: all tests pass and Axe reports zero violations in tested states. Open Students, Books, Logs, Settings, dialogs, and RTL/narrow states in the browser; correct clipped actions, awkward gaps, overlay collisions, focus visibility, or motion defects before committing.

Commit:

```powershell
git add apps/desktop-react
git commit -m "test: verify React desktop UX"
```

### Task 9: Verify Tauri, cut over Windows release wiring, and update handoff docs

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release-windows.yml`
- Modify: `README.md`
- Modify: `docs/runbooks/release.md`
- Modify: `docs/runbooks/verification.md`
- Modify: `AGENTS.md`
- Test: `apps/desktop-react/src/app/runtime-config.test.ts`

**Interfaces:**
- Produces: root `dev:desktop` targeting React and `dev:desktop:legacy` retaining Svelte.
- Produces: release workflow paths targeting `apps/desktop-react` and its production Tauri overlay.
- Preserves: installed identifier, database filename, updater endpoint/key, signing secret name, NSIS artifact checks, and SemVer prerelease publication behavior.

- [ ] **Step 1: Add failing source-contract assertions for release continuity**

```ts
it("keeps the release workflow on the production React identity", () => {
  expect(releaseWorkflow).toContain("apps/desktop-react/package.json");
  expect(releaseWorkflow).toContain("apps/desktop-react/src-tauri/tauri.production.conf.json");
  expect(productionTauri.identifier).toBe("com.studentbooktracker.app");
  expect(JSON.stringify(productionTauri)).toContain("releases/latest/download/latest.json");
});
```

- [ ] **Step 2: Run the contract test and confirm it fails on Svelte release paths**

Run: `npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts`

Expected: release workflow path assertions fail.

- [ ] **Step 3: Smoke the isolated React Tauri shell before cutover**

Run:

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
npm run tauri -w @app/desktop-react -- dev
```

In the real shell, verify preview data is created under `%APPDATA%\com.studentbooktracker.reactdev\student-book-tracker-react.db`; create a student and book, add stock, issue it, view/reverse the log, switch RTL, open/close dialogs by keyboard, and confirm the legacy production database is untouched.

- [ ] **Step 4: Switch root/release wiring and update documentation**

Root scripts become:

```json
{
  "dev:desktop": "npm run tauri -w @app/desktop-react -- dev",
  "dev:desktop:legacy": "npm run tauri -w @app/desktop -- dev",
  "dev:desktop:react": "npm run tauri -w @app/desktop-react -- dev"
}
```

Update the release workflow's version source, workspace/project path, production config argument, installer paths, signature paths, and `latest.json` verification to React. Keep `TAURI_SIGNING_PRIVATE_KEY` as the only required signing secret and `SYNC_API_BASE_URL` as public build configuration. Document Svelte rollback commands and the rule that only one production-identity shell may access the production database.

- [ ] **Step 5: Run the full completion verification**

Run:

```powershell
npm run test -w @app/desktop-react
npm run test:e2e -w @app/desktop-react
npm run typecheck -w @app/desktop-react
npm run lint -w @app/desktop-react
npm run build -w @app/desktop-react
npm run test
npm run typecheck
npm run lint
npm run build
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: every React, legacy, shared, API, root, browser, and Rust gate passes.

Create a copied representative legacy database under the production React app-data directory, run the production-identity build against that copy, and verify students, books, quantities, issued rows, logs, settings, outbox status, and sync cursor appear unchanged before allowing a release.

- [ ] **Step 6: Perform one focused final review, resolve findings, and commit**

Use one final review subagent only for requirement-parity, accessibility, release-identity, and rollback inspection. Fix every Critical or Important finding inline and rerun its covering tests.

Commit:

```powershell
git add package.json .github README.md docs AGENTS.md apps/desktop-react
git commit -m "feat: cut over to React desktop"
```

## Plan Completion Criteria

- `apps/desktop-react` is a complete React/Tauri app, not a static mockup.
- Students, Books, Logs, Settings, sync, conflicts, updater, Excel export, bilingual/RTL behavior, local SQLite, outbox, sync, reversals, and updates have parity evidence.
- The visual/interaction system addresses spacing, control density, table actions, form stability, feedback, motion, responsive layout, focus, and accessible modal behavior.
- Browser UI, Node SQLite integration, real Tauri preview, full monorepo regression, Cargo, and production data-continuity evidence are recorded.
- Production releases build React while preserving installed identity/data/updater continuity.
- The Svelte workspace remains present, buildable, documented, and available through `dev:desktop:legacy`.
- `AGENTS.md` contains the final segment handoff and verification commands.
