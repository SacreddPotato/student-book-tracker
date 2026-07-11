# Semester Inventory And Academic Years Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver independently stocked subject semesters, receipt-aware inventory, academic-year snapshots and rollover, production/development Neon migrations, and automatic release tagging.

**Architecture:** Books remain global subject rows with two balance columns. Students, issuances, and transactions are academic-year snapshots, while a synchronized `academic_years` table defines the current and archived years. Local-first services remain transactional and enqueue typed commands; the sync API applies the same invariants transactionally. React reads the current or selected archived year through a year context, while Books stays global.

**Tech Stack:** TypeScript 7, React 19, TanStack Query, Radix UI, Tauri 2, SQLite, Hono, Drizzle ORM/Postgres, Neon, Vitest, Testing Library, Playwright, GitHub Actions.

## Global Constraints

- Existing local and Neon application data is disposable placeholder data and will be cleared by migration.
- Books have exactly `first` and `second` semesters; no configurable semester table.
- Academic years use `YYYY-YYYY` with the second year exactly one greater.
- Archived years are readable/exportable but immutable; Books remains global.
- Rollover requires typed target-year confirmation and a clean synchronized state.
- Preparatory 3 has no successor row; its archived record remains readable.
- Production Neon migration happens before the user swaps `.env` to development; execution pauses immediately after production schema inspection.
- Never print or commit Neon URLs, transport secrets, updater keys, or signing material.
- Preserve `apps/desktop` as the rollback source.
- Use test-driven development and commit each completed task.

---

### Task 1: Shared Semester, Academic-Year, Promotion, And Sync Contracts

**Files:**
- Create: `packages/shared/src/domain/academic-year.ts`
- Create: `packages/shared/tests/academic-year.test.ts`
- Modify: `packages/shared/src/domain/inventory.ts`
- Modify: `packages/shared/src/domain/education.ts`
- Modify: `packages/shared/tests/education.test.ts`
- Modify: `packages/shared/src/protocol/sync-commands.ts`
- Modify: `packages/shared/tests/sync-commands.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `BookSemester`, `bookSemesters`, `parseAcademicYear`, `nextAcademicYear`, `isNextAcademicYear`, `promoteGrade`, `BookSelection`.
- Produces sync commands whose inventory writes carry semester/year/receipt data and whose year commands carry promoted snapshots.

- [ ] **Step 1: Write failing academic-year and promotion tests**

```ts
expect(parseAcademicYear("2025-2026")).toEqual({ startYear: 2025, endYear: 2026 });
expect(() => parseAcademicYear("2025-2027")).toThrow("consecutive");
expect(nextAcademicYear("2025-2026")).toBe("2026-2027");
expect(promoteGrade("kg2")).toEqual({ gradeLevel: "primary1", educationStage: "primary" });
expect(promoteGrade("preparatory3")).toBeNull();
```

- [ ] **Step 2: Run the shared tests and confirm RED**

Run: `npm run test -w @app/shared -- tests/academic-year.test.ts tests/education.test.ts tests/sync-commands.test.ts`

Expected: failure because the new contracts and helpers do not exist.

- [ ] **Step 3: Add the domain helpers**

```ts
export const bookSemesters = ["first", "second"] as const;
export type BookSemester = (typeof bookSemesters)[number];

export function parseAcademicYear(value: string) {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error("Academic year must contain consecutive years in YYYY-YYYY format.");
  }
  return { startYear: Number(match[1]), endYear: Number(match[2]) };
}

export function nextAcademicYear(value: string) {
  const { endYear } = parseAcademicYear(value);
  return `${endYear}-${endYear + 1}`;
}
```

Add an ordered grade array and implement `promoteGrade` by looking up the next entry and deriving its stage.

- [ ] **Step 4: Replace inventory command shapes**

```ts
export type BookSelection = { bookId: string; semester: BookSemester };

export type AddBookStockCommand = {
  id: string;
  type: "ADD_BOOK_STOCK";
  deviceId: string;
  occurredAt: string;
  academicYear: string;
  bookId: string;
  semester: BookSemester;
  quantity: number;
  receiptNumber: string;
  receiptDate: string;
};

export type IssueBooksToStudentCommand = {
  id: string;
  type: "ISSUE_BOOKS_TO_STUDENT";
  deviceId: string;
  occurredAt: string;
  academicYear: string;
  studentId: string;
  bookSelections: BookSelection[];
};
```

Add `INITIALIZE_ACADEMIC_YEAR` and `ADVANCE_ACADEMIC_YEAR`. The advance command contains `fromYear`, `toYear`, and `promotedStudents` with new ID, prior ID, copied identity, promoted stage, and promoted grade.

- [ ] **Step 5: Run shared tests and type checking**

Run: `npm run test -w @app/shared`

Expected: all shared tests pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/shared
git commit -m "feat: add semester and academic year contracts"
```

---

### Task 2: Canonical SQLite Schema And Destructive Placeholder Migration

**Files:**
- Modify: `apps/desktop-react/src/core/db/schema.ts`
- Modify: `apps/desktop-react/src/core/db/migrations.ts`
- Create: `apps/desktop-react/src/core/db/repositories/academic-years.ts`
- Modify: `apps/desktop-react/src/core/db/repositories/students.ts`
- Modify: `apps/desktop-react/src/core/db/repositories/books.ts`
- Modify: `apps/desktop-react/src/core/db/repositories/transactions.ts`
- Modify: `apps/desktop-react/src/core/db/persistence.test.ts`
- Replace obsolete continuity expectations: `apps/desktop-react/src/core/db/production-data-continuity.test.ts`

**Interfaces:**
- Produces `AcademicYearRow`, semester-aware `BookRow`, year-scoped `StudentRow`, `InventoryTransactionRow`, `InventoryTransactionItemRow`, and `StudentBookRow`.
- Produces repository methods `listAcademicYears`, `getCurrentAcademicYear`, `createInitialAcademicYear`, and year-filtered list methods.

- [ ] **Step 1: Write failing migration and repository tests**

Seed the old schema with placeholder rows, run migrations, and assert:

```ts
expect(await database.select("SELECT * FROM students")).toEqual([]);
expect(await database.select("SELECT * FROM books")).toEqual([]);
expect(await database.select("PRAGMA table_info(academic_years)"))
  .toEqual(expect.arrayContaining([expect.objectContaining({ name: "academic_year" })]));
expect(await database.select("PRAGMA table_info(books)"))
  .toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "first_semester_quantity" }),
    expect.objectContaining({ name: "second_semester_quantity" }),
  ]));
```

Add repository assertions for two book balances, student academic year, transaction receipt/year, item semester, and issuance semester/year.

- [ ] **Step 2: Run persistence tests and confirm RED**

Run: `npm run test -w @app/desktop-react -- src/core/db/persistence.test.ts src/core/db/production-data-continuity.test.ts`

Expected: failures for missing tables and columns.

- [ ] **Step 3: Replace the canonical schema**

Create `academic_years`; replace `books.quantity` with `first_semester_quantity` and `second_semester_quantity`; add `academic_year` and `previous_student_id` to students; add year/receipt fields to transactions; add semester to items; add semester/year to student books; update required table/index lists and check constraints.

- [ ] **Step 4: Add migration 002**

```ts
const domainTableDrops = [
  "DROP TABLE IF EXISTS student_books",
  "DROP TABLE IF EXISTS inventory_transaction_items",
  "DROP TABLE IF EXISTS inventory_transactions",
  "DROP TABLE IF EXISTS students",
  "DROP TABLE IF EXISTS books",
  "DROP TABLE IF EXISTS academic_years",
  "DROP TABLE IF EXISTS sync_outbox",
  "DROP TABLE IF EXISTS sync_state",
  "DROP TABLE IF EXISTS app_settings",
] as const;

export const migrations: Migration[] = [
  { id: "001_initial_local_schema", statements: schemaStatements },
  { id: "002_semester_inventory_academic_years", statements: [...domainTableDrops, ...schemaStatements] },
];
```

Keep `local_schema_migrations` intact so migration history remains auditable.

- [ ] **Step 5: Implement repository shapes and year filters**

Use `WHERE academic_year = $1` for students, issuances, and transactions. Book repositories select and update the two balances independently. Provide a helper that maps semester to the correct update statement without interpolating user input.

- [ ] **Step 6: Run database tests**

Run: `npm run test -w @app/desktop-react -- src/core/db`

Expected: migration and repository tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/desktop-react/src/core/db
git commit -m "feat: add semester and academic year persistence"
```

---

### Task 3: Local Inventory And Academic-Year Services

**Files:**
- Modify: `apps/desktop-react/src/core/services/inventory-service.ts`
- Modify: `apps/desktop-react/src/core/services/inventory-service.test.ts`
- Modify: `apps/desktop-react/src/core/services/entity-service.ts`
- Modify: `apps/desktop-react/src/core/services/entity-service.test.ts`
- Create: `apps/desktop-react/src/core/services/academic-year-service.ts`
- Create: `apps/desktop-react/src/core/services/academic-year-service.test.ts`

**Interfaces:**
- Produces `AddBookStockInput`, `IssueBooksToStudentInput`, `initializeAcademicYear`, and `advanceAcademicYear`.
- Consumes Task 1 promotion/year helpers and Task 2 repositories.

- [ ] **Step 1: Write failing semester inventory tests**

```ts
await addBookStock({
  academicYear: "2025-2026",
  bookId: "book-1",
  semester: "second",
  quantity: 3,
  receiptNumber: "00041",
  receiptDate: "2026-01-14",
}, context);

expect(await getBookById(database, "book-1")).toMatchObject({
  firstSemesterQuantity: 0,
  secondSemesterQuantity: 3,
});
expect(await getInventoryTransactionByCommandId(database, "command-1"))
  .toMatchObject({ receiptNumber: "00041", receiptDate: "2026-01-14" });
```

Cover both semesters in one issue, one semester out of stock without partial mutation, and reversal restoring the exact semester.

- [ ] **Step 2: Write failing academic rollover tests**

Initialize `2025-2026`, add students in KG1, KG2, Primary6, Preparatory3, add book stock and year-scoped logs, then advance. Assert promoted snapshots, no Preparatory3 successor, empty `2026-2027` issuance/log queries, archived `2025-2026` data preserved, and unchanged book balances.

- [ ] **Step 3: Run service tests and confirm RED**

Run: `npm run test -w @app/desktop-react -- src/core/services`

Expected: failures for the new inputs and missing rollover service.

- [ ] **Step 4: Implement validation and semester mutations**

```ts
export type AddBookStockInput = {
  academicYear: string;
  bookId: string;
  semester: BookSemester;
  quantity: number;
  receiptNumber: string;
  receiptDate: string;
};

export type IssueBooksToStudentInput = {
  academicYear: string;
  studentId: string;
  bookSelections: BookSelection[];
};
```

Trim receipt numbers, validate real ISO dates, detect duplicate composite selections, validate the student's year and stage, and mutate all rows in `runLocalTransaction`.

- [ ] **Step 5: Implement atomic initialization and rollover**

`initializeAcademicYear` validates the format, inserts one current year, and enqueues initialization. `advanceAcademicYear` verifies exact successor and clean-sync precondition supplied by the backend, archives the current row, creates promoted snapshots with generated IDs, enqueues the explicit promoted list, and returns a summary `{ promotedCount, voidedCount, toYear }`.

- [ ] **Step 6: Run service tests**

Run: `npm run test -w @app/desktop-react -- src/core/services`

Expected: all inventory, entity, and academic-year tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/desktop-react/src/core/services
git commit -m "feat: add semester inventory and year rollover services"
```

---

### Task 4: Neon Schema, Generated Migration, And Sync Command Application

**Files:**
- Modify: `apps/sync-api/src/db/schema.ts`
- Generate: `apps/sync-api/drizzle/0001_semester_inventory_academic_years.sql`
- Modify: `apps/sync-api/src/routes/sync.ts`
- Modify: `apps/sync-api/src/services/apply-command.ts`
- Modify: `apps/sync-api/src/services/sync-store.ts`
- Modify: `apps/sync-api/tests/memory-sync-store.ts`
- Modify: `apps/sync-api/tests/schema.test.ts`
- Modify: `apps/sync-api/tests/apply-command.test.ts`
- Modify: `apps/sync-api/tests/sync-routes.test.ts`

**Interfaces:**
- Produces the Postgres mirror of Task 2 and transactional handling for every Task 1 command.
- Produces ordered snapshot changes for academic years and promoted students.

- [ ] **Step 1: Write failing schema and command tests**

Assert required Postgres columns and constraints, receipt validation, second-semester stock, mixed-semester issue, exact reversal, initialization, valid promotion, stale rollover rejection, and no book mutation during rollover.

- [ ] **Step 2: Run sync API tests and confirm RED**

Run: `npm run test -w @app/sync-api`

Expected: schema and command tests fail for absent semester/year behavior.

- [ ] **Step 3: Modify Drizzle schema and generate migration**

Run: `npm run db:generate -w @app/sync-api`

Expected: a new committed migration that clears placeholder rows in dependency order, clears `sync_changes`, changes the schema, and preserves Drizzle's migrations table.

- [ ] **Step 4: Update Zod transport validation**

Require `semester`, `academicYear`, receipt fields, composite selections, and strict promoted snapshots. Validate dates with a refinement that round-trips the calendar components instead of relying on permissive `Date.parse` alone.

- [ ] **Step 5: Implement server transactions**

Update store interfaces to read and write semester balances. Lock current academic-year state for initialization/advance. Validate the promoted set against all active from-year students and the shared `promoteGrade` result. Record snapshots only after the transaction succeeds.

- [ ] **Step 6: Run sync API tests and type checking**

Run: `npm run test -w @app/sync-api`

Run: `npm run typecheck -w @app/sync-api`

Expected: both pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/sync-api
git commit -m "feat: apply semester and year commands remotely"
```

---

### Task 5: React Backend, Sync Pull, Fixtures, And Academic-Year Context

**Files:**
- Modify: `apps/desktop-react/src/core/backend/types.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.test.ts`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.ts`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.test.ts`
- Modify: `apps/desktop-react/src/core/backend/browser-fixtures.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.test.ts`
- Modify: `apps/desktop-react/src/core/sync/conflicts.ts`
- Modify: `apps/desktop-react/src/core/sync/conflicts.test.ts`
- Create: `apps/desktop-react/src/app/AcademicYearProvider.tsx`
- Create: `apps/desktop-react/src/app/AcademicYearProvider.test.tsx`
- Modify: `apps/desktop-react/src/App.tsx`

**Interfaces:**
- `AppBackend` gains year listing/setup/advance and year-parameterized student, issuance, log, and export reads.
- `useAcademicYear()` exposes `currentYear`, `viewYear`, `years`, `archived`, `setViewYear`, `initialize`, and `advance`.

- [ ] **Step 1: Write failing backend and pull tests**

Assert fixture and SQLite backends produce identical semester/year behavior. Pull snapshots must apply `academic_years` before invalidating year-scoped queries and must preserve both book balances. Conflict names include translated semester data.

- [ ] **Step 2: Run backend/sync tests and confirm RED**

Run: `npm run test -w @app/desktop-react -- src/core/backend src/core/sync`

Expected: type and behavior failures for the new backend contract.

- [ ] **Step 3: Expand `AppBackend`**

```ts
listAcademicYears(): Promise<AcademicYearRow[]>;
initializeAcademicYear(academicYear: string): Promise<void>;
advanceAcademicYear(toYear: string): Promise<AcademicYearAdvanceResult>;
listStudents(academicYear: string): Promise<StudentRow[]>;
listIssuedBooks(academicYear: string, studentId: string): Promise<StudentBookRow[]>;
listLogs(academicYear: string): Promise<LogEntry[]>;
```

Book methods remain year-independent. Stock additions receive the backend's current year.

- [ ] **Step 4: Apply new pull snapshots and fixture behavior**

Add `academic_years` handling to the sync engine, update row guards for new required fields, and make fixture mutations enforce archived-year read-only behavior and promotion rules.

- [ ] **Step 5: Add academic-year context**

The provider loads years after backend initialization, blocks children behind setup when no current year exists, defaults `viewYear` to current, and automatically returns to current after successful advance.

- [ ] **Step 6: Run backend/sync/provider tests**

Run: `npm run test -w @app/desktop-react -- src/core/backend src/core/sync src/app/AcademicYearProvider.test.tsx`

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/desktop-react/src/core apps/desktop-react/src/app apps/desktop-react/src/App.tsx
git commit -m "feat: expose academic year backend state"
```

---

### Task 6: React Semester, Receipt, Archive, Rollover, Logs, And Excel UX

**Files:**
- Modify: `apps/desktop-react/src/features/books/BooksScreen.tsx`
- Modify: `apps/desktop-react/src/features/books/BookTable.tsx`
- Modify: `apps/desktop-react/src/features/books/AddStockDialog.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
- Modify: `apps/desktop-react/src/features/students/StudentsScreen.tsx`
- Modify: `apps/desktop-react/src/features/students/StudentIssuancePanel.tsx`
- Modify: `apps/desktop-react/src/features/students/student-queries.ts`
- Modify: `apps/desktop-react/src/features/students/StudentsScreen.test.tsx`
- Modify: `apps/desktop-react/src/features/logs/LogsScreen.tsx`
- Modify: `apps/desktop-react/src/features/logs/LogsScreen.test.tsx`
- Modify: `apps/desktop-react/src/features/settings/SettingsScreen.tsx`
- Create: `apps/desktop-react/src/features/settings/AcademicYearSetupDialog.tsx`
- Create: `apps/desktop-react/src/features/settings/AdvanceAcademicYearDialog.tsx`
- Create: `apps/desktop-react/src/features/settings/academic-year-dialogs.test.tsx`
- Modify: `apps/desktop-react/src/components/shell/AppShell.tsx`
- Modify: `apps/desktop-react/src/core/export/excel-export.ts`
- Modify: `apps/desktop-react/src/core/export/excel-export.test.ts`
- Modify: `apps/desktop-react/src/core/i18n/en.ts`
- Modify: `apps/desktop-react/src/core/i18n/ar.ts`
- Modify: `apps/desktop-react/src/styles/books.css`
- Modify: `apps/desktop-react/src/styles/students.css`
- Modify: `apps/desktop-react/src/styles/operations.css`
- Modify: `apps/desktop-react/src/styles/shell.css`
- Modify: `apps/desktop-react/tests/e2e/app-fixture.ts`
- Modify: `apps/desktop-react/tests/e2e/students-books-logs.spec.ts`
- Create: `apps/desktop-react/tests/e2e/academic-year-rollover.spec.ts`

**Interfaces:**
- Consumes `useAcademicYear`, semester-aware backend methods, and the exact export status strings.
- Produces accessible disclosure controls and typed destructive confirmation.

- [ ] **Step 1: Write failing component tests**

Cover two independent book quantities/actions, three required receipt inputs, retained invalid form state, subject disclosure with two semester checkboxes, mixed-semester draft count, archived mutation controls absent/disabled, setup blocking, and exact rollover confirmation.

- [ ] **Step 2: Write failing Excel tests**

```ts
expect(subjectCell.value).toBe("1");
expect(secondOnlyCell.value).toBe("1");
expect(bothCell.value).toBe("2");
expect(neitherCell.value).toBe("0");
```

- [ ] **Step 3: Run focused UI/export tests and confirm RED**

Run: `npm run test -w @app/desktop-react -- src/features src/core/export/excel-export.test.ts`

Expected: failures for missing UI and output states.

- [ ] **Step 4: Implement Books and issuance UI**

Render two semester stock cells with labelled actions. Pass `{ book, semester }` to Add Stock and collect quantity, receipt number, and date. Implement subject disclosure buttons with `aria-expanded`, stable `aria-controls`, chevron rotation, and two semester `Checkbox` rows.

- [ ] **Step 5: Implement year selection, setup, and read-only archive UI**

Show the year selector on Students and Logs, a read-only archive banner, and no mutation controls in archived views. Mount the blocking setup dialog above the workspace. Add Settings rollover summary and require the exact target string before enabling the primary destructive action.

- [ ] **Step 6: Implement logs and Excel states**

Show semester labels and receipt metadata in logs. Group issued rows by subject for Excel and map the first/second booleans to the exact four-state cell value.

- [ ] **Step 7: Add dictionary parity and responsive styles**

Add every new key to English and Arabic. Keep controls at least 40px, semester rows at least 44px, logical RTL spacing, reduced-motion behavior, and no horizontal overflow at 390px.

- [ ] **Step 8: Run component tests**

Run: `npm run test -w @app/desktop-react -- src/features src/core/export src/core/i18n`

Expected: all focused component/export/i18n tests pass.

- [ ] **Step 9: Add rendered journeys**

Test first-run setup, both semester stock receipts, first/second/both issuance, reversal, archived-year read-only browsing, promotion chain including Preparatory3 voiding, empty new-year logs/issuance, unchanged book stock, and Excel download.

- [ ] **Step 10: Commit**

```powershell
git add apps/desktop-react
git commit -m "feat: add semester and academic year workflows"
```

---

### Task 7: Automatic CI Tagging And Current Documentation

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release-windows.yml`
- Modify: `apps/desktop-react/src/app/runtime-config.test.ts`
- Modify: `README.md`
- Modify: `docs/runbooks/release.md`
- Modify: `docs/runbooks/verification.md`
- Rewrite: `AGENTS.md`

**Interfaces:**
- CI creates one ordered demo version commit/tag only after validation of an eligible `pre-release` push.
- Tag push invokes the existing signed release pipeline.

- [ ] **Step 1: Write failing workflow contract tests**

Read both YAML files as text and assert CI contains `needs: validate`, the exact `pre-release`/non-bot condition, serialized concurrency, `npm version`, bot identity, annotated tag, and tag push. Assert pull requests and bot commits cannot enter the tagging job and release still listens for `v*` tags.

- [ ] **Step 2: Run workflow contract test and confirm RED**

Run: `npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts`

Expected: failure because CI does not tag.

- [ ] **Step 3: Add the serialized tagging job**

Use job-level `contents: write`, `if: github.event_name == 'push' && github.ref == 'refs/heads/pre-release' && github.actor != 'github-actions[bot]'`, fetch full history/tags, calculate the maximum numeric demo suffix, run `npm version 0.1.0-demo.<next> -w @app/desktop-react --no-git-tag-version`, commit package and lockfile, create an annotated tag, and push the commit and tag.

- [ ] **Step 4: Update release automation documentation**

Remove manual version bumping as the normal path. Retain workflow dispatch as emergency fallback and document signing/updater boundaries.

- [ ] **Step 5: Rewrite README and trim AGENTS.md**

README must include current capabilities, `dev:desktop`, `dev:desktop:react`, `dev:api`, environment file locations, academic-year rollover, and a safe production/development Neon branch-switch sequence. Rewrite `AGENTS.md` to current architecture, migration checkpoint, exact environment notes, latest verified commands, and next starting point; remove obsolete segment-by-segment history.

- [ ] **Step 6: Run contract tests and YAML parse check**

Run: `npm run test -w @app/desktop-react -- src/app/runtime-config.test.ts`

Run: `npx prettier --check .github/workflows/ci.yml .github/workflows/release-windows.yml`

Expected: workflow tests pass and YAML is parseable/formatted.

- [ ] **Step 7: Commit**

```powershell
git add .github README.md docs/runbooks AGENTS.md apps/desktop-react/src/app/runtime-config.test.ts
git commit -m "ci: automate demo release tagging"
```

---

### Task 8: Pre-Production Verification And Production Neon Migration Checkpoint

**Files:**
- Verify only; update `AGENTS.md` with exact evidence before committing checkpoint notes.

**Interfaces:**
- Consumes all prior tasks.
- Produces an inspected production Neon schema and the mandatory user pause.

- [ ] **Step 1: Run focused migration and domain suites**

Run:

```powershell
npm run test -w @app/shared
npm run test -w @app/desktop-react -- src/core/db src/core/services src/core/sync
npm run test -w @app/sync-api
npm run typecheck -w @app/desktop-react
npm run typecheck -w @app/sync-api
```

Expected: all pass before any production mutation.

- [ ] **Step 2: Rehearse the Postgres migration on a disposable database**

Apply the generated SQL to an isolated temporary Postgres database or transaction-backed test database, then inspect required tables, semester/year/receipt columns, uniqueness constraints, and empty placeholder tables.

- [ ] **Step 3: Inspect configuration without exposing secrets**

Confirm `apps/sync-api/.env` exists, `DATABASE_URL` parses as Postgres, and `SYNC_API_SHARED_SECRET` exists. Print only presence booleans and a redacted endpoint identifier hash; never print the URL or secret.

- [ ] **Step 4: Apply production migration**

Run: `npm run db:migrate -w @app/sync-api`

Expected: migration exits zero against the user-designated production Neon branch.

- [ ] **Step 5: Inspect production schema**

Run safe read-only catalog queries through the configured client to confirm the Drizzle migration row, `academic_years`, both semester quantity columns, year and receipt columns, semester columns, and new constraints. Confirm placeholder application tables and `sync_changes` are empty.

- [ ] **Step 6: Record checkpoint and commit**

Update `AGENTS.md` with the production migration timestamp, migration filename, redacted verification facts, and exact next step. Commit without `.env`.

```powershell
git add AGENTS.md
git commit -m "docs: record production semester migration"
```

- [ ] **Step 7: Pause for user branch switch**

Stop execution and tell the user: production migration is verified; replace `apps/sync-api/.env` `DATABASE_URL` with the Neon development-branch connection string, keep the matching shared secret, and reply when complete. Do not run the development migration or final suites before that reply.

---

### Task 9: Development Neon Migration And Final Verification After Resume

**Files:**
- Modify only if verification exposes defects.
- Update: `AGENTS.md`

**Interfaces:**
- Completes the goal only after every specification requirement has direct evidence.

- [ ] **Step 1: Confirm the user changed `.env` and apply development migration**

Repeat the redacted configuration check, run `npm run db:migrate -w @app/sync-api`, and inspect the same schema facts without printing credentials.

- [ ] **Step 2: Run complete automated verification sequentially**

```powershell
npm run test
npm run test:e2e -w @app/desktop-react
npm run typecheck
npm run lint
npm run build
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
```

Expected: every command exits zero.

- [ ] **Step 3: Run real Tauri smoke**

Launch `npm run dev:desktop`; verify Arabic startup, academic-year setup, two semester stock receipts, disclosure issuance, first/second/both Excel wording, reversal, successful sync, rollover typed confirmation, grade promotion, Preparatory3 voiding, archived read-only data, empty new-year logs/ownership, and unchanged book balances.

- [ ] **Step 4: Audit every explicit requirement**

Map each approved specification item to a test, schema inspection, workflow contract, rendered journey, or native observation. Treat missing evidence as incomplete and fix it before completion.

- [ ] **Step 5: Update AGENTS.md and commit final evidence**

Record exact test counts, migration status for both Neon branches, native smoke results, workflow behavior, environment rules, and the next release starting point.

```powershell
git add AGENTS.md
git commit -m "docs: finalize semester and academic year handoff"
```
