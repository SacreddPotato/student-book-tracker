# Delete Password and Book Inventory Export Design

## Summary

Add two small features to the active React desktop application:

1. Require the exact case-sensitive password `az2006` before either a student or book deletion can be submitted.
2. Add a Books-screen Excel export that audits current-academic-year stock receipts in one unified table on one worksheet.

Both features stay local to the React UI and existing Excel/log data paths. They require no SQLite or Postgres migration, no sync-protocol change, and no server or credential work.

## Password-Protected Deletion

The existing `DeleteConfirmationDialog` remains the single confirmation surface for current-year student deletion and active book deletion. Add one masked password field inside that dialog rather than introducing another modal, settings page, or authentication layer.

- The accepted value is the exact, case-sensitive string `az2006`.
- The password is checked in the React dialog before `onConfirm` is called. A wrong value keeps the dialog open, makes no backend call, and shows a localized inline error.
- The field starts empty every time the dialog opens and is cleared when the dialog closes, the deletion target changes, or a deletion succeeds. The password is never stored, remembered, logged, synchronized, or sent to the backend.
- The destructive action is disabled while the field is empty or while the existing deletion mutation is pending. Pressing Enter from the password field follows the same validation and submission path as the Delete button.
- Cancel, Escape, close-button, focus trapping, focus restoration, entity name, destructive styling, busy state, and existing deletion error notices remain unchanged.
- This guard applies only to the two operations that use `DeleteConfirmationDialog`: deleting students and deleting books. Transaction reversal and academic-year advancement are unchanged.

The hardcoded password is an accidental-action safeguard, not authentication or a security boundary. Because it is shipped in the desktop client, a determined user can extract it from the application bundle.

## Book Inventory Audit Export

### Export interaction

Add an Export button beside Add Book in the Books workspace header. It opens a compact dialog containing a checkbox list derived from active grade-specific book rows:

- Selection identity is the stable `BookRow.id`. Every active subject-and-grade pair appears independently, so `Maths — 1st Primary`, `Maths — 2nd Primary`, and `Maths — 3rd Primary` are separate options even though they share the same stored name.
- Each option label combines the stored book name with the localized exact grade label. The label is presentation-only and does not alter the book record.
- Sort options deterministically by stored subject name first, using the active language for text comparison, so identically named subjects stay together. Within each subject, use the canonical school progression `KG 1`, `KG 2`, `Primary 1` through `Primary 6`, then `Preparatory 1` through `Preparatory 3`; use stable `BookRow.id` as the final tie-breaker. Do not use creation time or the translated grade label for ordering.
- All available subject-grade options are selected whenever the dialog opens.
- The user may select any combination of subject-grade options. Selecting one includes only the active book row with that ID.
- Export is disabled when there is no current academic year, no active subject-grade option, no selected option, or an export is already running.
- The dialog remains open if data loading or workbook generation fails and shows the existing localized export error treatment. A successful download closes it and announces the existing export-success notice.
- Workbook code remains lazy-loaded so opening the Books screen does not eagerly load ExcelJS.

The export uses the existing `AppBackend.listLogs(currentAcademicYear)` and active `listBooks()` results. Do not add a dedicated database query or change `AppBackend` for this feature.

### Receipt eligibility and row construction

Determine the start date by converting the current academic-year row's UTC `createdAt` timestamp to its `Africa/Cairo` calendar date in `YYYY-MM-DD` form. A receipt dated on that same Cairo calendar date is included; therefore the comparison is `receiptDate >= currentYearCreatedDate`.

From the current academic year's logs, include only transactions that meet every condition:

- `type === "stock_increase"`;
- `reversedByTransactionId === null`;
- `receiptNumber` and `receiptDate` are present;
- `receiptDate` is on or after the current academic-year creation date;
- the transaction item belongs to an active book whose stable ID is selected.

Each qualifying stock-receipt item produces exactly one report row. A receipt that added 25 copies appears once with quantity `25`; it is not expanded into 25 rows and is not aggregated with another receipt. Deleted books, reversed stock receipts, receipts before the cutoff, issuance rows, and reversal rows are omitted.

Sort the unified rows by receipt date ascending, then receipt ID, base book name, semester (`first` before `second`), grade, and stable item ID. This makes the audit chronological and deterministic.

### Workbook layout

Create one worksheet and preserve the student export's established workbook conventions: localized school labels, logo placeholder, academic-year line, Arabic RTL behavior, fonts, alignments, thin table borders, landscape orientation, centered printing, and one-page-width fitting.

Replace the student export's grade title with:

- localized `Book Inventory Audit` when more than one subject-grade option is selected;
- localized `{subject} — {grade} Inventory Audit` when exactly one option is selected, retaining the stored subject name and using the localized exact grade label. For example: `Maths — 1st Primary Inventory Audit`.

Below the shared institutional header, render one continuous bordered table with these columns:

| Book | Grade | Quantity | Receipt date | Receipt ID |
| --- | --- | --- | --- | --- |

Every qualifying receipt item occupies one table row. Do not add a separate semester column. Instead, append the localized term to the stored book name in the Book cell:

- English first-semester example: `English First Term`;
- English second-semester example: `English Second Term`;
- Arabic uses the stored book name followed by `الفصل الدراسي الأول` or `الفصل الدراسي الثاني`.

The suffix is a presentation-only value; it does not rename the book or alter stored data. Do not add subject summary rows, subject grouping headings, totals, student data, or signature columns.

The Grade cell must use the book's exact `gradeLevel` translated through the existing grade labels, such as `1st Primary`, `2nd Primary`, or their Arabic equivalents. It must never use the broader `educationStage` label such as plain `Primary` or `Preparatory`.

The print area spans the unified table through its final receipt row. Fit to one page wide but allow vertical continuation onto additional printed pages so large reports remain legible. Arabic retains worksheet RTL rendering while preserving the same logical column order and localized cell alignment.

An eligible subject with no qualifying receipts produces no body rows; the workbook is still valid and downloadable with its header and column headings. Use the filename `book-inventory-audit-<academic-year>.xlsx`.

## Implementation Boundaries and Interfaces

- Keep `buildStudentsWorkbook` behavior unchanged. Extract private shared header/style helpers inside the export module only where this prevents the student and book exports from drifting.
- Keep the exported, framework-neutral `buildBooksWorkbook(input)` function and explicit input/receipt-row types in the existing Excel export module. Change its selection input from subject names to stable selected book IDs; it continues to receive active books, current-year logs, the complete current academic-year row, language, and translator.
- Add a book-workbook download wrapper or generalize the existing browser download helper without changing the student-export filename or call behavior.
- Add a focused Books export dialog component; keep data loading, busy/error state, notices, and lazy module import coordinated by `BooksScreen`.
- Add localized English and Arabic strings for password label/error, export dialog copy, report titles, term suffixes, and receipt columns.
- Lock the new user-facing translations as follows; reuse the existing grade, quantity, receipt-number, receipt-date, cancel, and export-success/error strings where they already exist:

| Key/meaning | English | Arabic |
| --- | --- | --- |
| Delete password | Password | كلمة المرور |
| Wrong password | Incorrect password. | كلمة المرور غير صحيحة. |
| Books export action | Export inventory | تصدير المخزون |
| Export dialog title | Export book inventory audit | تصدير مراجعة مخزون الكتب |
| Subject selection label | Subjects to include | المواد المطلوب تضمينها |
| General report title | Book Inventory Audit | مراجعة مخزون الكتب |
| Single-subject title | {subject} Inventory Audit | مراجعة مخزون {subject} |
| First-term suffix | First Term | الفصل الدراسي الأول |
| Second-term suffix | Second Term | الفصل الدراسي الثاني |
| Book column | Book | الكتاب |
| Receipt ID column | Receipt ID | رقم إذن الاستلام |
- Do not change SQLite/Postgres schemas, sync commands, direct Neon transport, the rollback Svelte frontend, or release configuration.

## Testing and Acceptance Criteria

### Deletion tests

- Student and book dialogs do not call their delete backend method for an empty or incorrect password.
- `az2006` submits exactly once, preserves the existing success behavior, and cannot double-submit while pending.
- Password matching is case-sensitive, wrong-password feedback is inline and localized, Enter submits through validation, and closing/reopening or switching targets clears both value and validation error.
- Archived students still expose no deletion action; reversal and rollover confirmations remain unchanged.

### Export tests

- The selector defaults to every active subject-grade row, displays localized `subject — exact grade` labels, supports multiple selections, keeps duplicate names in different grades independent, and blocks an empty selection.
- The selector groups subjects by localized name comparison and orders each subject's rows by the canonical school-grade progression, independent of creation time and translated ordinal text.
- Receipt-date filtering uses the Cairo-local calendar date of the current-year creation timestamp, includes that date, and excludes earlier receipts.
- Reversed stock receipts, deleted books, issuance/reversal logs, and unselected subjects are excluded.
- A quantity of 25 creates one row containing `25`, its receipt date, and receipt ID.
- Every Grade cell displays the translated exact `gradeLevel` (for example, `1st Primary`) rather than the broader education stage (`Primary`).
- Exactly one selected subject-grade option produces a title containing both its stored subject name and localized exact grade; multiple/all selections produce the general title.
- First- and second-semester receipts occupy one unified table, and each Book cell has exactly the appropriate localized `First Term` or `Second Term` suffix with no separate semester column.
- The unified table has the required columns, deterministic ordering, continuous borders, correct print area, landscape one-page-width setup, and no subject summaries or signature column.
- Arabic serialization preserves RTL view, reading order, academic-year digit order, localized headings, and Arabic term suffixes.
- Books-screen tests cover dialog open/cancel, selection changes, success, failure retention, busy-state duplicate prevention, and the generated filename.

### Verification

Run the focused React component and export suites first, then the complete sequential workspace gates:

```powershell
npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx src/features/students/StudentsScreen.test.tsx src/core/export/excel-export.test.ts
npm run typecheck -w @app/desktop-react
npm run test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
```

Render and inspect representative English and Arabic workbooks containing both semesters. Confirm the institutional header, exact titles, subject filtering, term-suffixed book names, receipt values, border continuity, RTL layout, and print area in a real spreadsheet viewer before calling the feature complete.
