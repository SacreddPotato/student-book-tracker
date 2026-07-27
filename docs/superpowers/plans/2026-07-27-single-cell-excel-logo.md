# Single-Cell Excel Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 128-pixel, vertically centered, single-cell logo in both Excel export headers.

**Architecture:** Keep the existing shared ExcelJS logo helper and change its geometry contract from a multi-cell region to one explicit column. Both workbook builders reserve one final-column cell and pass it to the helper.

**Tech Stack:** TypeScript, ExcelJS, Vitest, Vite, npm workspaces, Tauri release workflow

## Global Constraints

- Preserve the logo's `1080:1063` aspect ratio.
- Use one unmerged 128-by-128-pixel middle-row header cell in both exports.
- Preserve export data, localization, RTL behavior, table layout, print areas, and filenames.
- Release as the next unused stable patch version after `v1.0.8`.

---

### Task 1: Single-cell header geometry

**Files:**
- Modify: `apps/desktop-react/src/core/export/excel-export.test.ts`
- Modify: `apps/desktop-react/src/core/export/excel-export.ts`

**Interfaces:**
- Consumes: `buildStudentsWorkbook(input)` and `buildBooksWorkbook(input)`
- Produces: the same synchronous workbook-builder APIs with new logo geometry

- [ ] **Step 1: Write failing workbook tests**

Assert after XLSX reopening that row 2 is 96 points while rows 1 and 3 remain 24 points, the logo column is approximately 17.57 Excel width units, the image is 128 pixels wide with proportional height and a vertically centered row-2 anchor, and the old logo merges are absent.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -w @app/desktop-react -- src/core/export/excel-export.test.ts`

Expected: FAIL because the current workbooks reserve multi-column or three-row logo spans and constrain the drawing below 128 pixels.

- [ ] **Step 3: Implement the minimal geometry change**

Set row 2 to 96 points, rows 1 and 3 to 24 points, set the single logo column to `(128 - 5) / 7`, remove both logo merges, and anchor a 128-pixel-wide proportional drawing at the vertically centered fractional offset inside row 2.

- [ ] **Step 4: Verify focused and React regression suites**

Run the focused export test, React typecheck, and complete React test suite. All must pass.

### Task 2: Visual verification and release

**Files:**
- Modify: `AGENTS.md`
- Modify: `apps/desktop-react/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: verified workbooks from Task 1
- Produces: an annotated stable release tag and pushed `main`

- [ ] **Step 1: Generate and inspect representative workbooks**

Export Arabic student and inventory XLSX files, reopen them, scan for formula errors, render every sheet, and inspect the images for clipping, overlap, or alignment anomalies.

- [ ] **Step 2: Run release gates**

Run sequentially: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build`.

- [ ] **Step 3: Record the implementation checkpoint**

Update `AGENTS.md` with the exact geometry, RED/GREEN evidence, visual evidence, release version, and next starting point.

- [ ] **Step 4: Version, commit, tag, and push**

Advance the React workspace to `1.0.9`, commit the verified release source, create annotated tag `v1.0.9` on that exact commit, and push `main` plus the tag without moving prior tags.
