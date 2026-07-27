# Book Export Option Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort book-audit checkbox options by subject name and canonical school-grade progression instead of translated label text or creation order.

**Architecture:** `BooksScreen` will retain the stable book-ID option contract but include book name and grade while sorting. A language-aware subject-name comparator runs first, the flattened shared `gradeLevelsByStage` order runs second, and stable book ID is the final tie-breaker.

**Tech Stack:** React 19, TypeScript, `@app/shared` education contracts, Testing Library, Vitest.

## Global Constraints

- Subject names sort using the active UI language.
- Grade order is exactly `kg1`, `kg2`, `primary1` through `primary6`, then `preparatory1` through `preparatory3`.
- Stable `BookRow.id` is the final deterministic tie-breaker.
- Do not use creation timestamps or translated grade-label text for ordering.
- Preserve selection IDs, displayed labels, workbook filtering, titles, export state, and download behavior.

---

### Task 1: Canonically sort export choices

**Files:**
- Modify: `apps/desktop-react/src/features/books/BooksScreen.tsx`
- Test: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `gradeLevelsByStage` from `@app/shared`, current `language`, and active `BookRow[]`.
- Produces: the existing `BookInventoryExportOption[]`, ordered by subject, grade progression, then ID.

- [ ] **Step 1: Write the failing rendered-order regression test**

Extend the existing export fixture with the same subject in Primary 1, Primary 2, Primary 3, and Preparatory 2. Use creation timestamps that do not match grade order. Open the export dialog and assert the checkbox labels appear in this exact sequence:

```ts
expect(within(dialog).getAllByRole("checkbox").map((checkbox) =>
  checkbox.getAttribute("aria-label") ?? checkbox.textContent)).toEqual([
  "Primary Math — 1st Primary",
  "Primary Math — 2nd Primary",
  "Primary Math — 3rd Primary",
  "Primary Math — 2nd Preparatory",
  "Primary Science — 1st Primary",
]);
```

If the checkbox primitive derives its accessible name from external label text, use `within(dialog).getAllByRole("checkbox").map((checkbox) => checkbox.closest("label")?.textContent)` and assert the same labels.

- [ ] **Step 2: Run the rendered test and verify RED**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx
```

Expected: FAIL because current `label.localeCompare` places `2nd Preparatory` before later Primary grades.

- [ ] **Step 3: Implement canonical ordering**

Import `gradeLevelsByStage` and add the shared flattened rank near the screen constants:

```ts
const exportGradeOrder = Object.values(gradeLevelsByStage).flat();
```

Build a language-aware collator inside the existing memo and retain name/grade only for sorting:

```ts
const exportOptions = useMemo(() => {
  const subjectCollator = new Intl.Collator(language === "ar" ? "ar" : "en", {
    sensitivity: "base",
    numeric: true,
  });
  return (booksQuery.data ?? [])
    .map((book) => ({
      id: book.id,
      name: book.name,
      gradeLevel: book.gradeLevel,
      label: `${book.name} — ${t(`grades.${book.gradeLevel}`)}`,
    }))
    .sort((left, right) => subjectCollator.compare(left.name, right.name)
      || exportGradeOrder.indexOf(left.gradeLevel) - exportGradeOrder.indexOf(right.gradeLevel)
      || left.id.localeCompare(right.id));
}, [booksQuery.data, language, t]);
```

- [ ] **Step 4: Run focused and full verification**

Run separately in order:

```powershell
npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx
npm run typecheck -w @app/desktop-react
npm test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
git diff --check
```

Expected: every command exits `0`; the existing live-only suites may remain skipped.

- [ ] **Step 5: Update handoff and commit**

Record the root cause, canonical order, regression test, exact verification counts, and no-tag/no-push state in `AGENTS.md`, then commit only the sorting implementation, its test, and handoff:

```powershell
git add apps/desktop-react/src/features/books/BooksScreen.tsx apps/desktop-react/src/features/books/BooksScreen.test.tsx AGENTS.md
git commit -m "fix: sort book export options by grade progression"
```
