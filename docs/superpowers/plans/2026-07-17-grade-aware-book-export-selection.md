# Grade-Aware Book Export Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active subject-and-grade book row independently selectable in the inventory audit export and use both subject and exact grade in a single-selection report title.

**Architecture:** Replace the workbook's name-based `selectedSubjects` input with stable `selectedBookIds`. `BooksScreen` will derive one presentation option per active `BookRow`, while `BookInventoryExportDialog` will keep only selected IDs; localized labels remain a UI concern and the workbook resolves selected IDs against its own book input.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, ExcelJS, existing i18n and grade contracts.

## Global Constraints

- Use stable `BookRow.id` values for selection and filtering; never use the display label as identity.
- Display each option as `{stored book name} — {localized exact grade}`.
- A single selected ID uses `{subject} — {localized exact grade} Inventory Audit`; multiple IDs use `Book Inventory Audit`.
- Preserve all existing receipt eligibility, sorting, semester suffix, quantity, RTL, print, download, and error behavior.
- Do not change database schemas, sync contracts, the rollback Svelte frontend, or release configuration.

---

### Task 1: Filter and title the workbook by stable book ID

**Files:**
- Modify: `apps/desktop-react/src/core/export/excel-export.ts`
- Test: `apps/desktop-react/src/core/export/excel-export.test.ts`

**Interfaces:**
- Consumes: `BooksWorkbookInput.books: BookRow[]` and stable IDs selected by the Books UI.
- Produces: `BooksWorkbookInput.selectedBookIds: string[]` and exact-ID receipt filtering in `buildBooksWorkbook(input)`.

- [ ] **Step 1: Write the failing workbook regression test**

Add a test with `English` in Primary 1 and Primary 2, receipts for both rows, and only `englishPrimary1.id` selected. Assert that the restored workbook contains only the Primary 1 receipt and that `B1` is `English — 1st Primary Inventory Audit`:

```ts
const workbook = buildBooksWorkbook({
  books: [englishPrimary1, englishPrimary2],
  logs: [
    stockLog({ id: "p1", book: englishPrimary1, semester: "first", quantity: 5, receiptDate: "2026-09-02", receiptNumber: "P1" }),
    stockLog({ id: "p2", book: englishPrimary2, semester: "first", quantity: 7, receiptDate: "2026-09-03", receiptNumber: "P2" }),
  ],
  academicYear: currentAcademicYear,
  selectedBookIds: [englishPrimary1.id],
  language: "en",
  translate: bookTranslate,
});

expect(worksheet.getCell("B1").value).toBe("English — 1st Primary Inventory Audit");
expect(worksheet.getRow(6).values).toEqual([
  undefined, "English First Term", "1st Primary", 5, "2026-09-02", "P1",
]);
expect(worksheet.getRow(7).values).toEqual([]);
```

Update existing book-workbook fixtures from `selectedSubjects` to `selectedBookIds`, selecting the corresponding IDs. Keep the multiple-selection general-title assertion.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/core/export/excel-export.test.ts
```

Expected: TypeScript/Vitest fails because `selectedBookIds` is not part of `BooksWorkbookInput` and current filtering still uses book names.

- [ ] **Step 3: Implement exact-ID filtering and title resolution**

Change the input and private row builder to use IDs:

```ts
export type BooksWorkbookInput = {
  books: BookRow[];
  logs: LogEntry[];
  academicYear: AcademicYearRow;
  selectedBookIds: string[];
  language: ExportLanguage;
  translate: TranslateExport;
};

const selectedBookIds = new Set(input.selectedBookIds);
const activeBooks = new Map(input.books
  .filter((book) => !book.deletedAt && selectedBookIds.has(book.id))
  .map((book) => [book.id, book]));
```

Resolve the distinct selected active books in input order and build the title from the one selected book when its count is exactly one:

```ts
const selectedBookIds = new Set(input.selectedBookIds);
const selectedBooks = input.books.filter((book) =>
  !book.deletedAt && selectedBookIds.has(book.id));
const title = selectedBooks.length === 1
  ? t("export.subjectInventoryAudit", {
      subject: `${selectedBooks[0].name} — ${t(`grades.${selectedBooks[0].gradeLevel}`)}`,
    })
  : t("export.bookInventoryAudit");
```

Share that `Set` with receipt filtering rather than constructing another selection set.

- [ ] **Step 4: Run the focused workbook suite and React typecheck**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/core/export/excel-export.test.ts
npm run typecheck -w @app/desktop-react
```

Expected: the workbook suite and React typecheck pass.

- [ ] **Step 5: Commit the workbook correction**

```powershell
git add apps/desktop-react/src/core/export/excel-export.ts apps/desktop-react/src/core/export/excel-export.test.ts
git commit -m "fix: filter book audits by grade-specific book"
```

### Task 2: Present and submit grade-specific export options

**Files:**
- Modify: `apps/desktop-react/src/features/books/BookInventoryExportDialog.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.tsx`
- Test: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`

**Interfaces:**
- Consumes: active `BookRow[]`, `t("grades.<gradeLevel>")`, and `BooksWorkbookInput.selectedBookIds` from Task 1.
- Produces: `BookInventoryExportOption { id: string; label: string }`, dialog callback `onExport(selectedBookIds: string[]): void`, and exact selected IDs passed to `buildBooksWorkbook`.

- [ ] **Step 1: Write the failing rendered regression test**

Extend the Books screen fixture with three active `Maths` rows for `primary1`, `primary2`, and `primary3`. Open export and assert all three labels are independently rendered:

```ts
expect(screen.getByRole("checkbox", { name: "Maths — 1st Primary" })).toBeChecked();
expect(screen.getByRole("checkbox", { name: "Maths — 2nd Primary" })).toBeChecked();
expect(screen.getByRole("checkbox", { name: "Maths — 3rd Primary" })).toBeChecked();
```

Uncheck Primary 2 and Primary 3, export, and assert the workbook builder receives:

```ts
expect(buildBooksWorkbook).toHaveBeenCalledWith(expect.objectContaining({
  selectedBookIds: ["maths-primary1"],
}));
```

Retain the empty-selection, reset-on-reopen, failure-retention, and duplicate-submit assertions using the new option labels.

- [ ] **Step 2: Run the Books screen test and verify RED**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx
```

Expected: FAIL because the current UI renders one checkbox per unique name and submits names rather than IDs.

- [ ] **Step 3: Implement the grade-aware option contract**

Define the focused option type in the dialog and track IDs:

```ts
export type BookInventoryExportOption = {
  id: string;
  label: string;
};

export type BookInventoryExportDialogProps = {
  open: boolean;
  options: BookInventoryExportOption[];
  exporting: boolean;
  error: string | null;
  onOpenChange(open: boolean): void;
  onExport(selectedBookIds: string[]): void;
};
```

Initialize `selected` with `options.map(({ id }) => id)`, render `option.label`, key/check by `option.id`, and submit IDs in option order.

In `BooksScreen`, replace the deduplicated `subjects` memo with:

```ts
const exportOptions = useMemo(() => (booksQuery.data ?? [])
  .map((book) => ({
    id: book.id,
    label: `${book.name} — ${t(`grades.${book.gradeLevel}`)}`,
  }))
  .sort((left, right) => left.label.localeCompare(right.label)), [booksQuery.data, t]);
```

Rename `exportInventory(selectedSubjects)` to accept `selectedBookIds`, pass those IDs to `buildBooksWorkbook`, and pass `options={exportOptions}` to the dialog. Preserve all current busy, success, error, and filename behavior.

- [ ] **Step 4: Run the focused UI and combined regression suites**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx src/core/export/excel-export.test.ts
npm run typecheck -w @app/desktop-react
```

Expected: both suites and React typecheck pass.

- [ ] **Step 5: Commit the UI correction**

```powershell
git add apps/desktop-react/src/features/books/BookInventoryExportDialog.tsx apps/desktop-react/src/features/books/BooksScreen.tsx apps/desktop-react/src/features/books/BooksScreen.test.tsx
git commit -m "fix: select book audits by subject and grade"
```

### Task 3: Verify serialized output and repository gates

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: completed exact-ID workbook and UI behavior from Tasks 1 and 2.
- Produces: verified English and Arabic XLSX evidence plus an accurate repository handoff.

- [ ] **Step 1: Generate and reload representative workbooks**

Generate English and Arabic workbooks containing the same subject name in at least two grades. Reload them from disk and confirm the single-ID workbook contains only the selected grade's receipts and the title contains the localized subject-grade label.

- [ ] **Step 2: Render and inspect both worksheets**

Render `Book Inventory!A1:E<lastRow>` and confirm the title, exact grade, receipt rows, borders, RTL behavior, and print area remain legible and correct.

- [ ] **Step 3: Run the full sequential gates**

Run separately, in order:

```powershell
npm test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
git diff --check
```

Expected: every command exits `0`; the existing live-only suites may remain skipped.

- [ ] **Step 4: Update the repository handoff**

Add a dated `AGENTS.md` checkpoint recording the root cause, stable-ID fix, single-selection title, serialized workbook inspection, exact test counts, and that no schema or credential change is required. Set the next starting point to local merge/tag/push only after explicit user approval.

- [ ] **Step 5: Commit the handoff**

```powershell
git add AGENTS.md
git commit -m "docs: record grade-aware book export verification"
```
