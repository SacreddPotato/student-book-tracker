# Grade-Scoped Books and Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make books independently grade-scoped, constrain student grade filters to the selected stage, and add synchronized soft deletion for students and books.

**Architecture:** Add `gradeLevel` as a required book invariant in shared contracts, SQLite, Postgres, services, exports, and issuance. Multi-grade creation expands one form submission into independent book rows in one local transaction. Deletion writes tombstones locally and remotely while active queries hide them and history lookups include them.

**Tech Stack:** TypeScript, React 19, TanStack Query, Tauri 2, SQLite, Hono, Drizzle ORM, Neon Postgres, Vitest, Testing Library, Playwright.

## Global Constraints

- The Windows app remains offline-first and fully functional with no sync transport.
- Never expose `DATABASE_URL` or `SYNC_API_SHARED_SECRET` through Vite or the executable.
- Existing book IDs, quantities, inventory references, and audit history survive migration.
- Existing stage-only books map to `kg1`, `primary1`, or `preparatory1`; quantities are never cloned.
- Prior academic years remain read-only and student snapshots remain independent.
- Every production behavior follows RED → GREEN → REFACTOR.
- The preserved Svelte rollback frontend must continue to typecheck and build.

---

### Task 1: Grade-scoped shared contracts and schemas

**Files:**
- Modify: `packages/shared/src/domain/inventory.ts`
- Modify: `packages/shared/src/protocol/sync-commands.ts`
- Modify: `packages/shared/tests/inventory.test.ts`
- Modify: `packages/shared/tests/sync-commands.test.ts`
- Modify: `apps/desktop-react/src/core/db/schema.ts`
- Modify: `apps/desktop-react/src/core/db/migrations.ts`
- Modify: `apps/desktop-react/src/core/db/repositories/books.ts`
- Modify: `apps/desktop-react/src/core/db/production-data-continuity.test.ts`
- Modify: `apps/sync-api/src/db/schema.ts`
- Create: `apps/sync-api/drizzle/0003_grade_scoped_books.sql`
- Modify: `apps/sync-api/tests/schema.test.ts`

**Interfaces:**
- Produces: `GradeScopedBook`, `bookCanBeIssuedToStudent(book, student)`, `BookRow.gradeLevel`, `UPSERT_BOOK.book.gradeLevel`, `DELETE_STUDENT`, and `DELETE_BOOK`.

- [ ] **Step 1: Write failing shared and migration tests**

```ts
expect(bookCanBeIssuedToStudent(
  { educationStage: "primary", gradeLevel: "primary1" },
  { educationStage: "primary", gradeLevel: "primary2" },
)).toBe(false);
expect(syncCommandTypes).toContain("DELETE_STUDENT");
expect(syncCommandTypes).toContain("DELETE_BOOK");
expect(await database.select("PRAGMA table_info(books)"))
  .toEqual(expect.arrayContaining([expect.objectContaining({ name: "grade_level" })]));
```

- [ ] **Step 2: Run RED verification**

Run: `npm run test -w @app/shared && npm run test -w @app/desktop-react -- --run src/core/db/production-data-continuity.test.ts`

Expected: failures for missing book grade scope, delete command variants, and `grade_level`.

- [ ] **Step 3: Add contract and schema implementation**

```ts
export type GradeScopedBook = {
  id?: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
};

export function bookCanBeIssuedToStudent(book: GradeScopedBook, student: GradeScopedStudent) {
  return book.educationStage === student.educationStage
    && book.gradeLevel === student.gradeLevel;
}
```

Add `gradeLevel` to `UpsertBookCommand`; add command variants:

```ts
export type DeleteStudentCommand = CommandBase & {
  type: "DELETE_STUDENT";
  studentId: string;
  academicYear: string;
};
export type DeleteBookCommand = CommandBase & {
  type: "DELETE_BOOK";
  bookId: string;
};
```

Add local migration `003_grade_scoped_books` as a table rebuild so upgraded databases also enforce `grade_level TEXT NOT NULL`:

```sql
DROP INDEX IF EXISTS books_scope_stage_name_unique;
ALTER TABLE books RENAME TO books_before_grade_scope;
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL DEFAULT 'global',
  name TEXT NOT NULL,
  education_stage TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  first_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(first_semester_quantity >= 0),
  second_semester_quantity INTEGER NOT NULL DEFAULT 0 CHECK(second_semester_quantity >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO books SELECT id, scope_id, name, education_stage, CASE education_stage
  WHEN 'kg' THEN 'kg1'
  WHEN 'primary' THEN 'primary1'
  ELSE 'preparatory1'
END, first_semester_quantity, second_semester_quantity, created_at, updated_at, deleted_at
FROM books_before_grade_scope;
DROP TABLE books_before_grade_scope;
CREATE UNIQUE INDEX books_scope_grade_name_unique
  ON books(scope_id, grade_level, name) WHERE deleted_at IS NULL;
```

Create matching Postgres migration, then update row mapping, inserts, selects, required index lists, and Drizzle schema.

- [ ] **Step 4: Run GREEN verification**

Run: `npm run test -w @app/shared && npm run test -w @app/desktop-react -- --run src/core/db/production-data-continuity.test.ts && npm run test -w @app/sync-api -- --run tests/schema.test.ts`

Expected: all targeted suites pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared apps/desktop-react/src/core/db apps/sync-api/src/db apps/sync-api/drizzle apps/sync-api/tests/schema.test.ts
git commit -m "feat: scope books to grade levels"
```

### Task 2: Atomic local creation and deletion services

**Files:**
- Modify: `apps/desktop-react/src/core/services/entity-service.ts`
- Modify: `apps/desktop-react/src/core/services/entity-service.test.ts`
- Modify: `apps/desktop-react/src/core/db/repositories/books.ts`
- Modify: `apps/desktop-react/src/core/db/repositories/students.ts`
- Modify: `apps/desktop-react/src/core/backend/types.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.ts`
- Modify: `apps/desktop-react/src/core/backend/tauri-backend.test.ts`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.ts`
- Modify: `apps/desktop-react/src/core/backend/fixture-backend.test.ts`

**Interfaces:**
- Produces: `saveBooks(BookDraft): Promise<BookRow[]>`, `deleteStudent(studentId, academicYear)`, `deleteBook(bookId)`, and corresponding `AppBackend` methods.

- [ ] **Step 1: Write failing service tests**

```ts
const rows = await saveBooks({
  name: "English",
  educationStage: "primary",
  gradeLevels: ["primary1", "primary2"],
}, context());
expect(rows.map(({ gradeLevel }) => gradeLevel)).toEqual(["primary1", "primary2"]);
expect(await listPendingOutboxRows(database)).toHaveLength(2);

await deleteStudent("student-1", "2025-2026", context());
expect(await listStudents(database, "2025-2026")).toEqual([]);
expect((await listPendingOutboxRows(database)).at(-1)?.commandType)
  .toBe("DELETE_STUDENT");
```

Add equivalent book tombstone and invalid multi-grade rollback assertions.

- [ ] **Step 2: Run RED verification**

Run: `npm run test -w @app/desktop-react -- --run src/core/services/entity-service.test.ts src/core/backend/tauri-backend.test.ts src/core/backend/fixture-backend.test.ts`

Expected: missing service/backend methods and missing `gradeLevel` failures.

- [ ] **Step 3: Implement repository tombstones and atomic services**

```ts
export async function markStudentDeleted(database: SqlDatabase, id: string, deletedAt: string) {
  await database.execute(
    "UPDATE students SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL",
    [deletedAt, id],
  );
}
```

Implement the same for books. `saveBooks` validates all selected grades before `runLocalTransaction`, creates one book plus one outbox command per grade, and returns all rows. Editing with `id` requires exactly one grade. Delete methods load the active entity, validate the current year for students, set the tombstone, and enqueue the delete command in the same transaction.

- [ ] **Step 4: Preserve names in history lookups**

Add `listStudentRecords` and `listBookRecords` repository methods without `deleted_at IS NULL`; use them only in `listLogs`. Keep active list methods unchanged.

- [ ] **Step 5: Implement backend and fixture methods**

```ts
saveBooks(input) { return saveBooks(input, mutationContext); }
deleteStudent(studentId, academicYear) {
  return deleteStudent(studentId, academicYear, mutationContext);
}
deleteBook(bookId) { return deleteBook(bookId, mutationContext); }
```

Queue sync after successful mutations and mirror tombstone semantics in the fixture backend.

- [ ] **Step 6: Run GREEN verification**

Run: `npm run test -w @app/desktop-react -- --run src/core/services/entity-service.test.ts src/core/backend/tauri-backend.test.ts src/core/backend/fixture-backend.test.ts`

Expected: targeted suites pass with atomicity and tombstone assertions.

- [ ] **Step 7: Commit**

```powershell
git add apps/desktop-react/src/core
git commit -m "feat: add grade book and deletion services"
```

### Task 3: Remote grade validation and tombstone commands

**Files:**
- Modify: `apps/sync-api/src/routes/sync.ts`
- Modify: `apps/sync-api/src/services/apply-command.ts`
- Modify: `apps/sync-api/src/services/sync-store.ts`
- Modify: `apps/sync-api/tests/apply-command.test.ts`
- Modify: `apps/sync-api/tests/sync-routes.test.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.ts`
- Modify: `apps/desktop-react/src/core/sync/sync-engine.test.ts`

**Interfaces:**
- Consumes: shared delete commands and `BookRecord.gradeLevel`.
- Produces: accepted/rejected tombstone application and grade-aware issuance validation.

- [ ] **Step 1: Write failing API tests**

```ts
expect(await applyCommand(store, deleteStudentCommand)).toMatchObject({ status: "accepted" });
expect(store.students.get("student-1")?.deletedAt).toBe(now);
expect(await applyCommand(store, wrongGradeIssueCommand)).toMatchObject({
  status: "rejected",
  reasonCode: "VALIDATION_FAILED",
});
```

Route tests must accept both delete payloads, reject incompatible book stage/grade, and require `UPSERT_BOOK.book.gradeLevel`.

- [ ] **Step 2: Run RED verification**

Run: `npm run test -w @app/sync-api -- --run tests/apply-command.test.ts tests/sync-routes.test.ts`

Expected: schema and switch cases reject or ignore the new commands.

- [ ] **Step 3: Implement route schemas and store tombstones**

Add `gradeLevel` to book schema and delete variants to the discriminated union. Add store methods that update `deletedAt`/`updatedAt` and return the row. `applyCommand` validates grade-stage compatibility, compares both book fields during issuance, applies tombstones, and records entity changes.

- [ ] **Step 4: Strengthen pull validation**

```ts
function isBook(value: unknown): value is BookRow {
  return record(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.gradeLevel === "string"
    && typeof value.firstSemesterQuantity === "number"
    && typeof value.secondSemesterQuantity === "number";
}
```

Add sync-engine coverage showing pulled student/book tombstones disappear from active queries but remain stored.

- [ ] **Step 5: Run GREEN verification**

Run: `npm run test -w @app/sync-api -- --run tests/apply-command.test.ts tests/sync-routes.test.ts && npm run test -w @app/desktop-react -- --run src/core/sync/sync-engine.test.ts`

Expected: targeted suites pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/sync-api packages/shared apps/desktop-react/src/core/sync
git commit -m "feat: sync grade books and tombstones"
```

### Task 4: Grade-aware React UX and delete confirmations

**Files:**
- Modify: `apps/desktop-react/src/features/books/BookEditorSheet.tsx`
- Modify: `apps/desktop-react/src/features/books/BookTable.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.tsx`
- Modify: `apps/desktop-react/src/features/books/BooksScreen.test.tsx`
- Modify: `apps/desktop-react/src/features/students/StudentsScreen.tsx`
- Modify: `apps/desktop-react/src/features/students/StudentTable.tsx`
- Modify: `apps/desktop-react/src/features/students/StudentIssuancePanel.tsx`
- Modify: `apps/desktop-react/src/features/students/StudentsScreen.test.tsx`
- Create: `apps/desktop-react/src/components/ui/DeleteConfirmationDialog.tsx`
- Modify: `apps/desktop-react/src/core/export/excel-export.ts`
- Modify: `apps/desktop-react/src/core/export/excel-export.test.ts`
- Modify: `apps/desktop-react/src/core/i18n/en.ts`
- Modify: `apps/desktop-react/src/core/i18n/ar.ts`
- Modify: `apps/desktop-react/src/styles/books.css`
- Modify: `apps/desktop-react/src/styles/students.css`

**Interfaces:**
- Consumes: grade-scoped `BookRow` and backend save/delete methods.
- Produces: multi-grade creation UI, stage-specific grade filters, grade-only issuance, and accessible deletion flows.

- [ ] **Step 1: Write failing rendered tests**

```ts
await user.selectOptions(stageControl, "primary");
expect(screen.getByRole("option", { name: "1st Preparatory" })).not.toBeVisible();

await chooseBookGrades(user, ["1st Primary", "2nd Primary"]);
await saveBook(user);
expect((await backend.listBooks()).map(({ gradeLevel }) => gradeLevel))
  .toEqual(["primary1", "primary2"]);

await user.click(screen.getByRole("button", { name: "Delete student Mona Ahmed" }));
await user.click(within(screen.getByRole("dialog", { name: "Delete student" }))
  .getByRole("button", { name: "Delete" }));
expect(await backend.listStudents(year)).toEqual([]);
```

Add book deletion, confirmation cancellation, archived no-delete, and grade-only issuance assertions.

- [ ] **Step 2: Run RED verification**

Run: `npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx src/features/students/StudentsScreen.test.tsx src/core/export/excel-export.test.ts`

Expected: missing controls and wrong stage-wide filtering.

- [ ] **Step 3: Implement multi-grade book editor**

Creation renders `gradeLevelsByStage[stage]` as checkboxes and submits selected grades. Editing renders one grade selector and submits one grade. Changing stage clears incompatible selections and chooses the first grade only for edit mode.

- [ ] **Step 4: Implement grade display, filter, issuance, and export**

Book rows show translated grade. Student grade options derive from the selected stage:

```ts
const visibleGrades = stage === "all"
  ? Object.values(gradeLevelsByStage).flat()
  : [...gradeLevelsByStage[stage]];
```

Issuance and export compare `book.gradeLevel` to the student's/export grade.

- [ ] **Step 5: Implement confirmation dialog and delete mutations**

Use `Trash2`, destructive intent, named entity copy, mutation busy state, query invalidation, selection cleanup, success announcements, and no controls for archived students.

- [ ] **Step 6: Run GREEN verification**

Run: `npm run test -w @app/desktop-react -- --run src/features/books/BooksScreen.test.tsx src/features/students/StudentsScreen.test.tsx src/core/export/excel-export.test.ts`

Expected: all targeted rendered tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/desktop-react/src/features apps/desktop-react/src/components apps/desktop-react/src/core/export apps/desktop-react/src/core/i18n apps/desktop-react/src/styles
git commit -m "feat: add grade book and delete workflows"
```

### Task 5: Compatibility, migrations, and release verification

**Files:**
- Modify as required: `apps/desktop/src/lib/services/command-service.ts`
- Modify: `AGENTS.md`
- Modify: `apps/desktop-react/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: buildable rollback UI, verified migrations, and next patch release metadata.

- [ ] **Step 1: Update the frozen legacy adapter**

Map legacy stage-only book writes to the first grade for that stage when constructing `UPSERT_BOOK`; do not add deletion UI to the rollback frontend.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm run test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test --manifest-path apps/desktop-react/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop-react/src-tauri/Cargo.toml
```

Expected: every command exits 0.

- [ ] **Step 3: Rehearse and apply committed Drizzle migration**

Run the migration against disposable PostgreSQL first, then each user-designated Neon branch with `npm run db:migrate -w @app/sync-api`. Inspect columns, indexes, migration history, and record counts without printing credentials.

- [ ] **Step 4: Build and inspect production artifact**

Build the production Tauri executable without a sync URL, launch the exact binary, and verify Arabic, maximized layout, offline status, grade creation, grade filtering, and both deletion confirmations.

- [ ] **Step 5: Bump patch version and commit handoff**

```powershell
npm version patch -w @app/desktop-react --no-git-tag-version
git add AGENTS.md apps/desktop-react/package.json package-lock.json
git commit -m "chore: prepare grade and deletion release"
```

- [ ] **Step 6: Finish branch and release**

Use `superpowers:finishing-a-development-branch`: fresh full tests, merge to `main`, post-merge tests, push, wait for main CI, create a new annotated `vX.Y.Z` tag, wait for the signed workflow, download assets, verify versions/hashes/signatures/updater feed, update `AGENTS.md`, and clean the owned worktree.
