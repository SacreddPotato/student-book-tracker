# Excel Table Borders Design

**Status:** Approved on 2026-07-13

## Goal

Add a clear printable grid to the student Excel export without changing the report header, RTL/LTR behavior, issuance values, or page setup. The table must span the full printable width, and every student-row element must be separated by a border.

## Scope

- Border only the table beginning at the column-heading row and ending at the final student row.
- Leave the school details, grade/year block, logo region, and blank spacer row unchanged.
- Preserve the existing name, subject, and student-signature columns and all current alignment, font, and print behavior.

## Table Geometry

The name and subject columns remain individual logical cells. The student-signature cell begins immediately after the last subject and consumes every remaining printable column through `headerColumnCount`.

- When spare printable columns exist, merge the signature heading across them and repeat the same merge for each student row.
- When the signature column is already the final printable column, do not create a one-cell merge.
- This makes the grid reach the calculated print-area edge without exposing meaningless empty filler cells.

## Border Styling

Apply the same thin, automatic-color border to all four sides of every logical table cell:

- column-heading cells for name and subjects;
- the merged or single signature heading;
- each student name cell;
- each student's subject-state cells containing `0`, `1`, or `2`;
- each merged or single student-signature cell.

Each student row remains independent, so horizontal borders separate every body row. Merged signature cells receive one outer border and no internal filler-column dividers.

## Compatibility

- Arabic remains RTL with right-aligned text and centered headings/numeric values.
- English remains LTR.
- The two-line grade/year header, academic-year bidi isolation, subject filtering, issuance-state semantics, landscape orientation, one-page-width fitting, and calculated print area remain unchanged.
- No database, sync, translation, or release-version changes are required.

## Verification

Automated tests will cover:

1. A narrow export where the signature heading and each signature body cell merge through the final printable column.
2. Thin borders on every logical header and body cell after ExcelJS serialization and reload.
3. A wide export where the signature is already the final column and no redundant merge is created.
4. Unchanged Arabic/English alignment, `0`/`1`/`2` issuance values, and print geometry.

A representative Arabic workbook will be generated from the production exporter and inspected in Microsoft Excel print output to confirm the full-width grid, row separation, readable RTL content, and absence of borders around the report header.

## Handoff

Update `AGENTS.md` after implementation and verification with the exact border behavior, test evidence, visual QA result, and next integration point. Do not tag a release unless requested separately.
