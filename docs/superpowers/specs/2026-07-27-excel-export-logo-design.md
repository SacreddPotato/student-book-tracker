# Excel Export Logo Design

## Goal

Embed `apps/desktop-react/assets/logo.jpeg` in the reserved logo area of both
React desktop Excel exports:

- the grade-specific student issuance workbook;
- the book-inventory audit workbook.

The logo must preserve its original aspect ratio and remain fully contained
inside the header.

## Scope

This is a presentation-only change in
`apps/desktop-react/src/core/export/excel-export.ts`. It does not change export
data, filtering, localization, workbook filenames, database behavior, sync
contracts, or backend APIs.

## Design

Vite will import the JPEG as an inline data URL so the existing synchronous
workbook builders remain synchronous and exports do not depend on filesystem or
network access.

A shared helper will:

1. register the JPEG with the current ExcelJS workbook;
2. preserve the source image's `1080:1063` aspect ratio;
3. size and center the image inside the caller-provided reserved header region;
4. anchor the image as a one-cell drawing so it moves with the header without
   resizing or distorting.

The first three header rows will each use a 24-point height so the proportional
logo remains readable. The student export will use its existing dynamic right-side
merged region. The book-inventory export will use its existing `E1:E3` merged
region. Existing borders, text alignment, RTL settings, table structure, and
print areas remain unchanged.

## Verification

Test-driven implementation will first add a regression test that fails while
the workbook has no embedded image. The test will cover both workbook builders,
serialize each workbook to XLSX, reopen it with ExcelJS, and verify that each
workbook contains one JPEG drawing in the intended header region.

After implementation:

- run the focused Excel export test suite;
- run React typechecking and the complete React test suite;
- build the React production web bundle to prove the asset is packaged;
- generate representative student and book-inventory XLSX files;
- reopen and visually inspect both generated workbooks, confirming that the
  logo is present, proportional, contained, and does not overlap header text.

## Non-goals

- Restyling the workbook headers or tables.
- Replacing or editing the supplied logo.
- Adding configurable branding or alternate logos.
- Changing the preserved Svelte rollback frontend.
