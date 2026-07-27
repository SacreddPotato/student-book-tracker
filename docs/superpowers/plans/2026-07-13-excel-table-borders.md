# Excel Table Borders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width, thin-bordered grid to the student Excel table while leaving the report header and all existing export semantics unchanged.

**Architecture:** Keep the change inside `buildStudentsWorkbook`. Treat name cells, subject cells, and the signature region as logical table cells; merge the signature region across spare printable columns, then apply one shared four-sided thin border style to each logical cell. Verify the serialized XLSX and real Microsoft Excel print output.

**Tech Stack:** TypeScript, React 19, ExcelJS, Vitest, Microsoft Excel print-to-PDF, `@oai/artifact-tool` for workbook inspection.

## Global Constraints

- Border only the table beginning at the column-heading row and ending at the final student row.
- Leave the school details, grade/year block, logo region, and blank spacer row unchanged.
- Preserve RTL/LTR alignment, `0`/`1`/`2` issuance values, landscape orientation, one-page-width fitting, and the calculated print area.
- Use thin automatic-color borders on all four sides of every logical table cell.
- Merge the signature heading and each signature body cell through `headerColumnCount` only when spare printable columns exist.
- Do not add dependencies, database migrations, sync changes, translation changes, or release-version changes.
- Do not tag a release unless requested separately.

---

### Task 1: Full-width bordered student table

**Files:**
- Modify: `apps/desktop-react/src/core/export/excel-export.test.ts`
- Modify: `apps/desktop-react/src/core/export/excel-export.ts`

**Interfaces:**
- Consumes: `buildStudentsWorkbook(input: StudentsWorkbookInput): ExcelJS.Workbook`, the existing `headerColumnCount`, `headerRow`, `stageBooks`, `gradeStudents`, and alignment objects.
- Produces: the same public workbook API, with signature ranges merged to the printable edge and thin borders on every logical table cell.

- [ ] **Step 1: Add a failing narrow-table serialization test**

Add a reusable assertion and a test with one subject and two students. Serialize and reload the workbook so the test validates the actual XLSX model:

```ts
function expectThinBorder(cell: ExcelJS.Cell) {
  expect(cell.border).toMatchObject({
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  });
}

it("extends a bordered table through the full printable width", async () => {
  const workbook = buildStudentsWorkbook({
    students: [students[0], { ...students[0], id: "student-2", name: "Omar Ali" }],
    books: [books[0]],
    gradeLevel: "primary1",
    academicYear: "2025-2026",
    language: "en",
    issuedBookSelectionsByStudentId: {},
    translate: (key) => key,
  });
  const data = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(data);
  const worksheet = restored.getWorksheet("Students")!;

  expect(worksheet.model.merges).toEqual(expect.arrayContaining([
    "C5:H5", "C6:H6", "C7:H7",
  ]));
  for (const address of ["A5", "B5", "C5", "A6", "B6", "C6", "A7", "B7", "C7"]) {
    expectThinBorder(worksheet.getCell(address));
  }
  expect(worksheet.getCell("A4").border).toEqual({});
});
```

- [ ] **Step 2: Run the narrow test and verify RED**

Run:

```powershell
npm run test -w @app/desktop-react -- src/core/export/excel-export.test.ts
```

Expected: FAIL because `C5:H5`, `C6:H6`, and `C7:H7` are absent and table cells have no thin borders.

- [ ] **Step 3: Add a failing wide-table regression test**

Add this focused serialization test proving the signature is already the last printable column:

```ts
it("borders a wide table without a redundant signature merge", async () => {
  const manyBooks = Array.from({ length: 8 }, (_, index): BookRow => ({
    ...books[0],
    id: `book-${index + 1}`,
    name: `Book ${index + 1}`,
  }));
  const workbook = buildStudentsWorkbook({
    students,
    books: manyBooks,
    gradeLevel: "primary1",
    academicYear: "2025-2026",
    language: "en",
    issuedBookSelectionsByStudentId: {},
    translate: (key) => key === "export.studentSignature" ? "student signature" : key,
  });
  const data = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(data);
const worksheet = restored.getWorksheet("Students")!;

  expect(worksheet.model.merges).not.toContain("J5:J5");
  expect(worksheet.getCell("J5").value).toBe("student signature");
  for (let column = 1; column <= 10; column += 1) {
    expectThinBorder(worksheet.getCell(5, column));
    expectThinBorder(worksheet.getCell(6, column));
  }
  expect(worksheet.pageSetup.printArea).toBe("A1:J6");
});
```

- [ ] **Step 4: Run the suite and verify the wide test is RED**

Run:

```powershell
npm run test -w @app/desktop-react -- src/core/export/excel-export.test.ts
```

Expected: FAIL on the missing borders while the existing print-area assertion remains green.

- [ ] **Step 5: Implement the minimal signature-range and border helpers**

Inside `buildStudentsWorkbook`, define one shared border and two local helpers after the alignment objects:

```ts
const tableBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};
const signatureColumn = stageBooks.length + 2;
const tableCell = (row: number, column: number) => {
  const cell = worksheet.getCell(row, column);
  cell.border = tableBorder;
  return cell;
};
const signatureCell = (row: number) => {
  if (signatureColumn < headerColumnCount) {
    worksheet.mergeCells(row, signatureColumn, row, headerColumnCount);
  }
  return tableCell(row, signatureColumn);
};
```

Use `tableCell` for the name heading, every subject heading, each student name, and each numeric subject cell. Use `signatureCell` for the signature heading and every student signature body cell. Preserve the existing values, fonts, and alignments:

```ts
const nameHeader = tableCell(headerRow, 1);
nameHeader.value = t("export.name");
nameHeader.alignment = centeredAlignment;
stageBooks.forEach((book, index) => {
  const cell = tableCell(headerRow, index + 2);
  cell.value = book.name;
  cell.alignment = centeredAlignment;
});
const signatureHeader = signatureCell(headerRow);
signatureHeader.value = t("export.studentSignature");
signatureHeader.alignment = centeredAlignment;

// Inside each student row:
const studentName = tableCell(row, 1);
studentName.value = student.name;
studentName.alignment = textAlignment;
stageBooks.forEach((book, bookIndex) => {
  const first = issued.has(`${book.id}:first`);
  const second = issued.has(`${book.id}:second`);
  const stateCell = tableCell(row, bookIndex + 2);
  stateCell.value = first && second ? "2" : first || second ? "1" : "0";
  stateCell.alignment = centeredAlignment;
});
const studentSignature = signatureCell(row);
studentSignature.value = "";
studentSignature.alignment = centeredAlignment;
```

- [ ] **Step 6: Run focused GREEN verification**

Run:

```powershell
npm run test -w @app/desktop-react -- src/core/export/excel-export.test.ts
npm run typecheck -w @app/desktop-react
```

Expected: the export test file passes all eight tests and React typecheck exits 0.

- [ ] **Step 7: Commit the implementation**

```powershell
git add apps/desktop-react/src/core/export/excel-export.ts apps/desktop-react/src/core/export/excel-export.test.ts
git commit -m "feat: border Excel student tables"
```

---

### Task 2: Visual QA, full verification, and handoff

**Files:**
- Modify: `AGENTS.md`
- Read only: `apps/desktop-react/src/core/export/excel-export.ts`

**Interfaces:**
- Consumes: the bordered `buildStudentsWorkbook` output from Task 1.
- Produces: verified Microsoft Excel print output and an accurate repository handoff checkpoint.

- [ ] **Step 1: Generate a representative Arabic workbook from production code**

Use a temporary TypeScript builder outside the repository with two Preparatory 2 students, four subjects, mixed `0`/`1`/`2` issuance states, and academic year `2025-2026`. Import `buildStudentsWorkbook` and `getTranslation` from this worktree, write the XLSX to a conversation-specific temporary directory, and do not patch the workbook after generation. The builder input must use this exact shape:

```ts
const workbook = buildStudentsWorkbook({
  students: [
    {
      id: "student-1", scopeId: "global", name: "أحمد علي",
      governmentId: "29801011234567", educationStage: "preparatory",
      gradeLevel: "preparatory2", academicYear: "2025-2026",
      previousStudentId: null, createdAt: now, updatedAt: now, deletedAt: null,
    },
    {
      id: "student-2", scopeId: "global", name: "مريم حسن",
      governmentId: "29801011234568", educationStage: "preparatory",
      gradeLevel: "preparatory2", academicYear: "2025-2026",
      previousStudentId: null, createdAt: now, updatedAt: now, deletedAt: null,
    },
  ],
  books: ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم"]
    .map((name, index) => ({
      id: `book-${index + 1}`, scopeId: "global", name,
      educationStage: "preparatory" as const, gradeLevel: "preparatory2" as const,
      firstSemesterQuantity: 10, secondSemesterQuantity: 10,
      createdAt: now, updatedAt: now, deletedAt: null,
    })),
  gradeLevel: "preparatory2",
  academicYear: "2025-2026",
  language: "ar",
  issuedBookSelectionsByStudentId: {
    "student-1": [
      { bookId: "book-1", semester: "first" },
      { bookId: "book-1", semester: "second" },
      { bookId: "book-2", semester: "first" },
    ],
    "student-2": [
      { bookId: "book-3", semester: "second" },
      { bookId: "book-4", semester: "first" },
      { bookId: "book-4", semester: "second" },
    ],
  },
  translate: (key, values) => getTranslation("ar", key as TranslationKey, values),
});
```

Expected workbook geometry: `A1:H7`, signature ranges `F5:H5`, `F6:H6`, and `F7:H7`.

- [ ] **Step 2: Inspect the serialized workbook and Microsoft Excel print output**

Using the bundled workspace dependency runtime, import the generated XLSX with `@oai/artifact-tool`, inspect `A1:H7`, and render it. Then open the same XLSX read-only through Microsoft Excel COM, export it to PDF, and render the first page.

Verify all of the following visually and structurally:

- the table border reaches both printable edges;
- every name, subject value, and signature row is separated by thin borders;
- rows 1 through 4 retain their existing header/whitespace treatment;
- the Arabic grade/year text and `2025-2026` order remain correct;
- the table remains legible on one landscape page width.

- [ ] **Step 3: Update the handoff checkpoint**

Append this section to `AGENTS.md`, replacing counts only if the fresh commands report different exact values:

```markdown
Excel table grid checkpoint (2026-07-13 Cairo):

- Student Excel exports now merge the signature heading and each signature body cell through the final printable column, so narrow subject sets still use the complete calculated page width without empty filler cells.
- Thin borders frame every logical name, subject, and signature cell from the table heading through the final student row. The school/grade/logo header and spacer row remain unbordered and otherwise unchanged.
- ExcelJS serialization tests cover narrow and wide subject sets, merged signature ranges, individual body separation, unchanged `0`/`1`/`2` semantics, and preserved print geometry.
- Microsoft Excel print output verified the full-width grid, Arabic RTL content, correct `2025-2026` order, and landscape one-page-width fitting.
- Focused export verification passed 1 file / 8 tests. Full workspace test, typecheck, lint, five rendered Chromium journeys, and build gates passed.
```

Set `## Next Starting Point` to state that the border implementation is complete on `codex/excel-table-borders`, requires no migration or credential change, and should not be released unless separately requested.

- [ ] **Step 4: Run all final gates sequentially**

Run:

```powershell
npm run test
npm run typecheck
npm run lint
npm run test:e2e
npm run build
git diff --check
```

Expected: legacy 18 files / 67 tests; React 29 passed files / 128 tests with one live-only test skipped; sync API 4 passed files / 27 tests with four live-gated tests skipped; shared 5 files / 26 tests; five Chromium journeys; all typecheck/lint/build commands and `git diff --check` exit 0.

- [ ] **Step 5: Commit the verified handoff**

```powershell
git add AGENTS.md
git commit -m "docs: record Excel table border verification"
```

- [ ] **Step 6: Review final branch state**

Run:

```powershell
git status --short --branch
git log -3 --oneline
```

Expected: clean `codex/excel-table-borders` branch containing the design, implementation, and handoff commits, with no generated workbook or preview artifact tracked in Git.
