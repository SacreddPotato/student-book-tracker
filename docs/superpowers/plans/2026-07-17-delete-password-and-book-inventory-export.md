# Delete Password and Book Inventory Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require `az2026` for student/book deletion and add a subject-filtered current-year Book Inventory Audit workbook with one receipt per row.

**Architecture:** Keep deletion authorization entirely inside the existing React confirmation dialog. Reuse active books, current academic-year metadata, and `AppBackend.listLogs()` to derive export rows in the framework-neutral Excel module; add a compact Books-screen selector and no database, backend-interface, sync, or release changes.

**Tech Stack:** React 19, TypeScript, TanStack Query, Radix Dialog/Checkbox, ExcelJS 4.4, Vitest, React Testing Library, Playwright, Tauri 2.

## Global Constraints

- The delete password is exactly and case-sensitively `az2026`; it is a client-side accidental-action guard, not authentication.
- Never persist, log, sync, or send the password to a backend.
- Export only active selected books and unreversed `stock_increase` receipt items from the current academic year whose `receiptDate` is on or after the Cairo-local calendar date of the current academic-year row's `createdAt` timestamp.
- One receipt item creates one row with its full quantity; do not expand quantities or aggregate receipts.
- Use one unified table with columns Book, Grade, Quantity, Receipt date, and Receipt ID. Append localized `First Term` / `Second Term` text to the Book cell and do not create a semester column.
- Grade cells use translated exact `gradeLevel` labels such as `1st Primary`, never broad `educationStage` labels such as `Primary`.
- Preserve existing student workbook output exactly and preserve offline-first behavior.
- Do not change SQLite/Postgres schemas, `AppBackend`, sync commands, Neon transport, the Svelte rollback frontend, or release configuration.
- Run workspace test, lint, typecheck, E2E, and build sequentially because concurrent legacy Svelte checks can race in `.svelte-kit`.

---

### Task 1: Add the password gate to the shared deletion dialog

**Files:**
- Modify: `apps/desktop-react/src/components/ui/DeleteConfirmationDialog.tsx`
- Create: `apps/desktop-react/src/components/ui/DeleteConfirmationDialog.test.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
- Modify: `apps/desktop-react/src/features/students/StudentsScreen.test.tsx`
- Modify: `apps/desktop-react/src/core/i18n/en.ts`
- Modify: `apps/desktop-react/src/core/i18n/ar.ts`

**Interfaces:**
- Consumes: existing `DeleteConfirmationDialog` props and `Field` component.
- Produces: the same component API; `onConfirm()` is called only after exact local password validation.

- [ ] **Step 1: Write failing password-dialog and screen tests**

Create a focused test that renders the dialog in `AppProviders`, enters `AZ2026` and expects localized inline failure with no callback, enters `az2026` and expects one callback, submits with Enter, and rerenders through close/reopen plus a changed `entityName` to prove the field/error reset. Update the existing Books and Students deletion journeys to assert the record remains after an incorrect password and disappears only after typing `az2026`.

Use this interaction shape in both screen tests:

```tsx
const password = within(dialog).getByLabelText("Password");
await user.type(password, "wrong");
await user.click(within(dialog).getByRole("button", { name: "Delete" }));
expect(within(dialog).getByText("Incorrect password.")).toBeVisible();
expect(await backend.listBooks()).toHaveLength(2); // use listStudents for the student test
await user.clear(password);
await user.type(password, "az2026");
await user.click(within(dialog).getByRole("button", { name: "Delete" }));
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/components/ui/DeleteConfirmationDialog.test.tsx src/features/books/BooksScreen.test.tsx src/features/students/StudentsScreen.test.tsx
```

Expected: failures show that the password field/error do not exist and current deletion still calls the backend immediately.

- [ ] **Step 3: Implement the minimal dialog-local password state**

Use a form so Enter and button submission share one path. Keep the password constant module-private and preserve the component props:

```tsx
const DELETE_PASSWORD = "az2026";

const [password, setPassword] = useState("");
const [passwordError, setPasswordError] = useState<string | null>(null);
const formId = useId();

useEffect(() => {
  setPassword("");
  setPasswordError(null);
}, [entityName, open]);

function submit(event: FormEvent) {
  event.preventDefault();
  if (saving) return;
  if (password !== DELETE_PASSWORD) {
    setPasswordError(t("deletion.incorrectPassword"));
    return;
  }
  setPasswordError(null);
  onConfirm();
}
```

Render the entity name and field inside `<form id={formId} onSubmit={submit}>`; set the field to `type="password"`, `autoComplete="off"`, `label={t("deletion.password")}`, `error={passwordError}`, and clear the error on edits. Make the destructive button `type="submit" form={formId}` and disable it when `!password || saving`. Add exact translations:

```ts
deletion: { password: "Password", incorrectPassword: "Incorrect password." }
deletion: { password: "كلمة المرور", incorrectPassword: "كلمة المرور غير صحيحة." }
```

- [ ] **Step 4: Run focused GREEN and React typecheck**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/components/ui/DeleteConfirmationDialog.test.tsx src/features/books/BooksScreen.test.tsx src/features/students/StudentsScreen.test.tsx
npm run typecheck -w @app/desktop-react
```

Expected: all focused deletion tests pass; existing archived-student behavior remains green; React typecheck passes.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/desktop-react/src/components/ui/DeleteConfirmationDialog.tsx apps/desktop-react/src/components/ui/DeleteConfirmationDialog.test.tsx apps/desktop-react/src/features/books/BooksScreen.test.tsx apps/desktop-react/src/features/students/StudentsScreen.test.tsx apps/desktop-react/src/core/i18n/en.ts apps/desktop-react/src/core/i18n/ar.ts
git commit -m "feat: require password for deletion"
```

---

### Task 2: Build the unified Book Inventory Audit workbook

**Files:**
- Modify: `apps/desktop-react/src/core/export/excel-export.ts`
- Modify: `apps/desktop-react/src/core/export/excel-export.test.ts`

**Interfaces:**
- Consumes: `BookRow[]`, `LogEntry[]`, `AcademicYearRow`, selected exact subject names, language, and `TranslateExport`.
- Produces:

```ts
export type BooksWorkbookInput = {
  books: BookRow[];
  logs: LogEntry[];
  academicYear: AcademicYearRow;
  selectedSubjects: string[];
  language: ExportLanguage;
  translate: TranslateExport;
};

export type BookReceiptExportRow = {
  itemId: string;
  bookId: string;
  bookName: string;
  gradeLevel: GradeLevel;
  semester: BookSemester;
  quantity: number;
  receiptDate: string;
  receiptNumber: string;
};

export function buildBooksWorkbook(input: BooksWorkbookInput): ExcelJS.Workbook;
export async function downloadBooksWorkbook(
  workbook: ExcelJS.Workbook,
  fileName?: string,
): Promise<void>;
```

- [ ] **Step 1: Write failing workbook tests for filtering, layout, and serialization**

Add `describe("book inventory Excel export", ...)` fixtures containing:

- a current year created at `2026-09-01T22:30:00.000Z`, whose Cairo cutoff is `2026-09-02`;
- an included receipt on `2026-09-02`, an excluded receipt on `2026-09-01`, a reversed receipt, an issuance, two selected subject names across distinct grades, an unselected subject, and both semesters;
- a receipt quantity of `25`.

Assert one unified worksheet named `Book Inventory`, headings in row 5 (`Book`, `Grade`, `Quantity`, `Receipt date`, `Receipt ID`), data beginning row 6, exact values such as `English First Term`, `English Second Term`, `1st Primary`, `25`, the receipt date, and receipt ID. Assert no semester column, no broad `Primary` grade, no reversed/old/unselected rows, chronological deterministic ordering, thin borders, `A1:E<lastRow>` print area, landscape one-page-width setup, general vs single-subject titles, and Arabic RTL/term suffix serialization.

- [ ] **Step 2: Run the export test and verify RED**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/core/export/excel-export.test.ts
```

Expected: `buildBooksWorkbook` and book-export translations do not exist.

- [ ] **Step 3: Extract reusable header/style helpers without changing student output**

Keep the student builder's current column counts, merges, values, borders, alignments, and print area. Extract only private helpers for reading order, alignments, borders, and the three-row institutional header. Parameterize the header with the worksheet, logical column count, report title, academic year, language, and translator; use five actual columns for the book table with widths exactly `32, 22, 14, 20, 20`.

Add a Cairo date-key helper based on `Intl.DateTimeFormat(...).formatToParts()` rather than slicing UTC text:

```ts
function cairoDateKey(utcIso: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(utcIso));
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}
```

- [ ] **Step 4: Implement receipt-row derivation and the book workbook**

Build an active-book map, selected-name set, and Cairo cutoff. Flatten only logs satisfying `type === "stock_increase"`, `reversedByTransactionId === null`, non-null receipt metadata, and `receiptDate >= cutoff`. Retain only positive-quantity items whose active mapped book name is selected. Sort by receipt date, receipt number, base name, semester (`first` before `second`), translated-independent grade key, and item ID.

For each row:

```ts
const term = t(row.semester === "first" ? "export.firstTerm" : "export.secondTerm");
worksheet.getCell(excelRow, 1).value = `${row.bookName} ${term}`;
worksheet.getCell(excelRow, 2).value = t(`grades.${row.gradeLevel}`);
worksheet.getCell(excelRow, 3).value = row.quantity;
worksheet.getCell(excelRow, 4).value = row.receiptDate;
worksheet.getCell(excelRow, 5).value = row.receiptNumber;
```

Use `export.bookInventoryAudit` for multiple/all selected names and `export.subjectInventoryAudit` with `{subject}` for exactly one. Apply full borders/alignment to row 5 through the final data row, RTL view for Arabic, landscape, `fitToPage`, `fitToWidth = 1`, `fitToHeight = 0`, horizontal centering, and print area `A1:E<lastRow>`. Reuse the existing Blob download mechanism through a private generic helper so `downloadStudentsWorkbook` remains compatible. Give `downloadBooksWorkbook` the fallback `book-inventory-audit.xlsx`; `BooksScreen` always supplies the required academic-year filename.

- [ ] **Step 5: Run export GREEN and regression checks**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/core/export/excel-export.test.ts
npm run typecheck -w @app/desktop-react
```

Expected: all existing student workbook tests and new book workbook tests pass; React typecheck passes.

- [ ] **Step 6: Commit Task 2**

```powershell
git add apps/desktop-react/src/core/export/excel-export.ts apps/desktop-react/src/core/export/excel-export.test.ts
git commit -m "feat: build book inventory audit workbook"
```

---

### Task 3: Add the subject selector and wire Books-screen export

**Files:**
- Create: `apps/desktop-react/src/features/books/BookInventoryExportDialog.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
- Modify: `apps/desktop-react/src/core/i18n/en.ts`
- Modify: `apps/desktop-react/src/core/i18n/ar.ts`
- Modify: `apps/desktop-react/src/styles/books.css`

**Interfaces:**
- Consumes: sorted unique active book names and `BooksScreen` export state.
- Produces:

```ts
export type BookInventoryExportDialogProps = {
  open: boolean;
  subjects: string[];
  exporting: boolean;
  error: string | null;
  onOpenChange(open: boolean): void;
  onExport(selectedSubjects: string[]): void;
};
```

- [ ] **Step 1: Write failing Books-screen export interaction tests**

Seed current academic-year metadata, active duplicate subject names across grades, and stock logs. Mock the lazy export module functions or the browser download boundary. Assert:

- Export inventory opens a compact dialog;
- unique subjects are all checked on every open;
- multiple selections are supported and zero selections disable Export;
- one selected name passes every grade-specific matching book plus current-year logs and the complete current-year row to `buildBooksWorkbook`;
- success downloads exactly once as `book-inventory-audit-2025-2026.xlsx`, closes the dialog, and announces success;
- failure retains the dialog/selection and shows export error;
- busy state prevents duplicate export.

- [ ] **Step 2: Run the Books-screen test and verify RED**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx
```

Expected: the export button/dialog and book workbook wiring are absent.

- [ ] **Step 3: Implement the compact selector component**

Use `Dialog`, `Checkbox`, `Alert`, and `Button`. Reset selection to `new Set(subjects)` and clear component-local state whenever `open` becomes true; toggle exact subject strings; sort subjects with `localeCompare`; submit `subjects.filter(subject => selected.has(subject))`. Disable the submit button for zero selection or `exporting`, keep closing disabled while exporting, and render the screen-owned error above a scrollable `.book-export-subjects` fieldset.

- [ ] **Step 4: Wire current-year log loading and lazy workbook creation**

In `BooksScreen`, derive:

```ts
const { currentYear, years } = useAcademicYear();
const currentAcademicYear = years.find((row) =>
  row.status === "current" && row.academicYear === currentYear) ?? null;
const subjects = [...new Set((booksQuery.data ?? []).map(({ name }) => name))]
  .sort((left, right) => left.localeCompare(right));
```

Add export-open/error/busy state. The export handler loads `backend.listLogs(currentAcademicYear.academicYear)`, dynamically imports `buildBooksWorkbook` and `downloadBooksWorkbook`, passes active books, logs, the complete year row, selected names, language, and translated keys, then downloads `book-inventory-audit-${currentAcademicYear.academicYear}.xlsx`. On success close/clear and announce `feedback.exportReady`; on failure retain dialog/selections and set `errors.export`; always clear busy state. Put a Download-icon button beside Add Book and disable it without current year/subjects or while busy.

Add the exact spec translations under `books`, `deletion`, and `export`, including:

```ts
books: {
  exportInventory: "Export inventory",
  exportDialogTitle: "Export book inventory audit",
  exportSubjects: "Subjects to include",
}
export: {
  bookInventoryAudit: "Book Inventory Audit",
  subjectInventoryAudit: "{subject} Inventory Audit",
  firstTerm: "First Term",
  secondTerm: "Second Term",
  book: "Book",
  grade: "Grade",
  quantity: "Quantity",
  receiptDate: "Receipt date",
  receiptId: "Receipt ID",
}
```

Add the exact Arabic values alongside the English keys:

```ts
deletion: { password: "كلمة المرور", incorrectPassword: "كلمة المرور غير صحيحة." }
books: {
  exportInventory: "تصدير المخزون",
  exportDialogTitle: "تصدير مراجعة مخزون الكتب",
  exportSubjects: "المواد المطلوب تضمينها",
}
export: {
  bookInventoryAudit: "مراجعة مخزون الكتب",
  subjectInventoryAudit: "مراجعة مخزون {subject}",
  firstTerm: "الفصل الدراسي الأول",
  secondTerm: "الفصل الدراسي الثاني",
  book: "الكتاب",
  grade: "الصف",
  quantity: "الكمية",
  receiptDate: "تاريخ إذن الاستلام",
  receiptId: "رقم إذن الاستلام",
}
```

Add only focused layout rules for a bordered/scrollable subject fieldset; reuse existing workspace-heading action responsiveness.

- [ ] **Step 5: Run focused GREEN and the complete React suite**

Run:

```powershell
npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx src/components/ui/DeleteConfirmationDialog.test.tsx src/features/students/StudentsScreen.test.tsx src/core/export/excel-export.test.ts
npm run test -w @app/desktop-react
npm run typecheck -w @app/desktop-react
```

Expected: focused tests, the full React suite, and React typecheck pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add apps/desktop-react/src/features/books/BookInventoryExportDialog.tsx apps/desktop-react/src/features/books/BooksScreen.tsx apps/desktop-react/src/features/books/BooksScreen.test.tsx apps/desktop-react/src/core/i18n/en.ts apps/desktop-react/src/core/i18n/ar.ts apps/desktop-react/src/styles/books.css
git commit -m "feat: add book inventory export workflow"
```

---

### Task 4: Verify rendered workbooks and complete the handoff

**Files:**
- Modify: `AGENTS.md`
- Modify only if a rendered journey finds a regression: `apps/desktop-react/tests/e2e/students-books-logs.spec.ts`

**Interfaces:**
- Consumes: completed password and export workflows.
- Produces: verified bilingual workbook evidence and an accurate repository handoff.

- [ ] **Step 1: Generate representative English and Arabic workbook fixtures**

Use the production `buildBooksWorkbook` with two selected subjects, multiple grades, both terms, unequal receipt counts, quantity `25`, an excluded pre-cutoff receipt, and a reversed receipt. Write temporary `.xlsx` files outside tracked source or under ignored test output.

- [ ] **Step 2: Inspect workbook values and visual rendering**

Serialize/reload with ExcelJS to assert values and merges, then open/render both workbooks in a real spreadsheet viewer. Confirm one unified five-column table, exact grade labels, localized term suffixes, RTL/LTR alignment, continuous borders, school header, report title, academic year, print area, and legibility at one page wide. Do not commit generated workbook artifacts.

- [ ] **Step 3: Run complete sequential verification**

Run:

```powershell
npm run test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
git diff --check
```

Expected: all workspace test files, lint, typechecks, five or more Chromium journeys, builds, and diff check pass. If the Books header action is already covered by component tests and existing E2E remains green, do not add an unrelated E2E journey.

- [ ] **Step 4: Update the handoff**

Replace `AGENTS.md`'s latest implementation/verification checkpoint with concise facts for this segment: password behavior and limitation, unified export rules, no migration/backend/sync change, exact focused/full verification results, workbook visual evidence, current branch/commit, and the next safe starting point.

- [ ] **Step 5: Commit verification and handoff**

```powershell
git add AGENTS.md apps/desktop-react/tests/e2e/students-books-logs.spec.ts
git diff --cached --quiet apps/desktop-react/tests/e2e/students-books-logs.spec.ts; if ($LASTEXITCODE -eq 0) { git reset -- apps/desktop-react/tests/e2e/students-books-logs.spec.ts }
git commit -m "docs: record protected deletion and book export"
```

If the E2E file was not changed, stage and commit only `AGENTS.md`.
