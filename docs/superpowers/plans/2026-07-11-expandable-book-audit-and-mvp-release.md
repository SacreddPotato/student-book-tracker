# Expandable Book Audit And MVP Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-year expandable audit trail to Books, verify the complete MVP, publish the next demo and `v1.0.0` Windows releases, then merge the verified branch into `main`.

**Architecture:** Add one book-scoped history projection at the SQLite repository/backend boundary and mirror it in the deterministic fixture backend. Render it lazily as a full-width detail row under a clickable Books row, then pass the complete repository and rendered suites before any remote release or merge action.

**Tech Stack:** React 19, TypeScript, TanStack Query, Tauri 2 SQLite, Lucide React, Vitest, Testing Library, Playwright, GitHub Actions/CLI.

## Global Constraints

- History spans every academic year and displays an academic-year label per event.
- The main row is pointer-clickable; the chevron remains a native keyboard-accessible disclosure button.
- Plus/edit actions never toggle the disclosure.
- Stock additions show receipt number/date; issuance/reversal show their operation date/time.
- Reversed originals and inverse reversal events remain visible.
- No new database migration is required: both Neon targets already contain the approved semester/year/receipt schema.
- Do not merge `pre-release` into `main` until both the demo and `v1.0.0` release artifacts are verified.

---

### Task 1: Book-Scoped Cross-Year Audit Projection

**Files:**
- Modify: `apps/desktop-react/src/core/db/repositories/transactions.ts`
- Modify: `apps/desktop-react/src/core/backend/types.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.ts`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.test.ts`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.test.ts`

**Interfaces:**
- Produces `BookHistoryEvent` with transaction/item IDs, `academicYear`, `type`, `semester`, signed delta, quantity after, student, receipt metadata, timestamps, and reversal pointers.
- Produces `AppBackend.listBookHistory(bookId: string): Promise<BookHistoryEvent[]>`.

- [ ] **Step 1: Write failing backend tests**

Seed stock, issuance, and reversal events across two years and assert one book query returns newest-first events with receipt/student/year/semester/reversal metadata.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/core/backend/tauri-backend.test.ts src/core/backend/fixture-backend.test.ts --reporter=verbose`

Expected: type/runtime failure because `listBookHistory` does not exist.

- [ ] **Step 3: Implement repository and backend projection**

Add one joined SQLite query filtered by `item.book_id`, ordered by transaction occurrence and item creation descending. Map fixture arrays to the identical contract without querying year-by-year.

- [ ] **Step 4: Verify GREEN**

Run the focused command from Step 2 and expect all tests to pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop-react/src/core
git commit -m "feat: add cross-year book audit projection"
```

---

### Task 2: Expandable Books Row And Plus Actions

**Files:**
- Create: `apps/desktop-react/src/features/books/BookHistoryPanel.tsx`
- Modify: `apps/desktop-react/src/features/books/BookTable.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
- Modify: `apps/desktop-react/src/core/i18n/en.ts`
- Modify: `apps/desktop-react/src/core/i18n/ar.ts`
- Modify: `apps/desktop-react/src/styles/books.css`

**Interfaces:**
- Consumes `listBookHistory(bookId)` and existing `books` TanStack Query invalidation.
- Produces a lazy `BookHistoryPanel` with loading/error/empty/event states and one expanded row at a time.

- [ ] **Step 1: Write failing component tests**

Assert row click and chevron expansion, cross-year metadata, receipt and issuance dates, collapse, action propagation isolation, `aria-expanded`, and Lucide plus icons.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/features/books/BooksScreen.test.tsx --reporter=verbose`

Expected: failures for missing disclosure/history and old stock icon.

- [ ] **Step 3: Implement minimal UI**

Use a clickable main `<tr>`, stop propagation on stock/edit action wrappers, place a `ChevronDown` disclosure button at the row end, and render a following `<tr><td colSpan={5}>` containing a semantic event list. Use `Plus` for both semester actions.

- [ ] **Step 4: Add bilingual copy and responsive styles**

Add translated addition/issuance/reversal, receipt, student, year, empty/error, expand/collapse, and reversed labels. Wrap event metadata at narrow widths and disable chevron motion for reduced-motion users.

- [ ] **Step 5: Verify GREEN and dictionary parity**

Run: `npx vitest run src/features/books/BooksScreen.test.tsx src/core/i18n/i18n.test.ts --reporter=verbose`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop-react/src/features/books apps/desktop-react/src/core/i18n apps/desktop-react/src/styles/books.css
git commit -m "feat: add expandable book audit history"
```

---

### Task 3: Rendered Audit Journey

**Files:**
- Modify: `apps/desktop-react/tests/e2e/students-books-logs.spec.ts`
- Modify: `apps/desktop-react/tests/e2e/responsive-rtl-accessibility.spec.ts`

- [ ] **Step 1: Extend rendered tests**

Create receipt stock and issuance, expand the book by clicking its row, verify year/semester/receipt/student/date content, verify plus click opens stock without collapsing, and check narrow RTL layout has no document overflow.

- [ ] **Step 2: Run rendered suite**

Run: `npm run test:e2e -w @app/desktop-react`

Expected: every Chromium journey passes.

- [ ] **Step 3: Commit**

```powershell
git add apps/desktop-react/tests/e2e
git commit -m "test: cover expandable book audit journey"
```

---

### Task 4: Migration And Handoff Evidence

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Record development migration evidence**

Record fingerprint `7368381c29be`, three Drizzle rows, required columns, empty application tables, and that the audit query requires no new schema migration.

- [ ] **Step 2: Commit**

```powershell
git add AGENTS.md
git commit -m "docs: record development migration verification"
```

---

### Task 5: Complete Local Verification

- [ ] **Step 1: Run sequential repository gates**

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

- [ ] **Step 2: Run a React/Tauri smoke**

Start `npm run dev:desktop`, confirm Arabic maximized startup, synchronized state, expandable audit interaction, plus actions, and custom window controls. Stop both processes cleanly.

- [ ] **Step 3: Update and commit exact evidence**

Update `AGENTS.md` with command/test counts and native observations, then commit.

---

### Task 6: CI And Automatic Demo EXE Release

- [ ] **Step 1: Push `pre-release`**

Run `git push origin pre-release` and record the pushed commit.

- [ ] **Step 2: Watch CI and automatic release**

Use `gh run list/view/watch` to require successful validation, automatic `0.1.0-demo.N` version/tag creation, signed Windows build, and publication.

- [ ] **Step 3: Verify release assets**

Use `gh release view v0.1.0-demo.N --json isDraft,isPrerelease,assets,targetCommitish` and require a published EXE, `.exe.sig`, and `latest.json` for the expected source.

- [ ] **Step 4: Synchronize local branch**

Fetch/pull the CI-authored version commit and confirm local `pre-release` equals the remote tip and demo tag ancestry.

---

### Task 7: `v1.0.0` Release And Main Merge

- [ ] **Step 1: Set the stable version**

Run `npm version 1.0.0 -w @app/desktop-react --no-git-tag-version`, verify the package and lockfile, commit `chore: release v1.0.0`, and rerun the release contract/typecheck test.

- [ ] **Step 2: Push branch and annotated tag**

Create `git tag -a v1.0.0 -m "Release v1.0.0"`, then push `pre-release` and `v1.0.0`.

- [ ] **Step 3: Wait for and verify the stable release**

Require successful release workflow and published EXE, signature, and updater metadata whose version/source is `1.0.0`.

- [ ] **Step 4: Merge verified source to main**

Fetch `main`, switch to it, merge `pre-release` without dropping history, run a final fast typecheck/release-contract check, and push `main`.

- [ ] **Step 5: Final audit and handoff**

Map every goal requirement to migration output, tests, CI run, release assets, tag ancestry, and remote `main`. Update `AGENTS.md`, commit/push any final handoff change, then mark the active goal complete only if all evidence is present.
