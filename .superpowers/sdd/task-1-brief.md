# Track A Task 1: Grade-scoped shared contracts and schemas

Base commit: `4c0a4d19547b269aa53daa0ed0992b88d3ef7e25`

## Goal

Add required grade scope to book contracts and both database schemas without losing existing book IDs, quantities, or history references.

## Binding constraints

- Work only in `C:\Users\ahmed\Documents\student-book-tracker\.worktrees\grade-scoped-delete`.
- Follow strict RED → GREEN → REFACTOR. Record the failing commands and expected failures before production edits.
- Existing stage-only books map to `kg1`, `primary1`, or `preparatory1`; quantities are never cloned.
- Preserve Svelte rollback build compatibility.
- Do not expose or read secret values.
- Update `AGENTS.md` after the completed segment.
- Commit all task changes before reporting.

## Files

- `packages/shared/src/domain/inventory.ts`
- `packages/shared/src/protocol/sync-commands.ts`
- `packages/shared/tests/inventory.test.ts`
- `packages/shared/tests/sync-commands.test.ts`
- `apps/desktop-react/src/core/db/schema.ts`
- `apps/desktop-react/src/core/db/migrations.ts`
- `apps/desktop-react/src/core/db/repositories/books.ts`
- `apps/desktop-react/src/core/db/production-data-continuity.test.ts`
- `apps/sync-api/src/db/schema.ts`
- `apps/sync-api/drizzle/0003_grade_scoped_books.sql`
- `apps/sync-api/tests/schema.test.ts`

## Required interfaces

Replace stage-only eligibility with grade-aware types:

```ts
export type GradeScopedBook = {
  id?: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
};

export function bookCanBeIssuedToStudent(
  book: GradeScopedBook,
  student: GradeScopedStudent,
): boolean {
  return book.educationStage === student.educationStage
    && book.gradeLevel === student.gradeLevel;
}
```

`BookRow` and `UpsertBookCommand.book` gain `gradeLevel: GradeLevel`.

Add command union variants:

```ts
export type DeleteStudentCommand = {
  id: string;
  type: "DELETE_STUDENT";
  deviceId: string;
  occurredAt: string;
  studentId: string;
  academicYear: string;
};

export type DeleteBookCommand = {
  id: string;
  type: "DELETE_BOOK";
  deviceId: string;
  occurredAt: string;
  bookId: string;
};
```

Local schema adds `books.grade_level TEXT NOT NULL` for fresh databases and replaces the required unique index with `books_scope_grade_name_unique` on `(scope_id, grade_level, name)` where active.

Migration `003_grade_scoped_books` must use SQLite-compatible statements: add a nullable column, populate its deterministic grade, drop the old index, and create the new partial unique index. SQLite cannot add a NOT NULL constraint to an existing table in-place; the populated column plus repository/runtime validation is accepted for upgraded databases.

Postgres migration must add/populate/set-not-null, drop the old index, and create the new partial index. Drizzle schema must reflect the result.

## Tests and commands

First add tests proving:

- same stage/different grade is ineligible;
- same stage/same grade is eligible;
- delete command shapes are represented by the `SyncCommand` union;
- fresh/local upgraded schema exposes `grade_level` and the new index;
- an existing book retains ID, semester balances, and inventory item references while gaining the deterministic grade;
- remote required schema includes the grade column and new index.

Run RED:

```powershell
npm run test -w @app/shared
npm run test -w @app/desktop-react -- --run src/core/db/production-data-continuity.test.ts
npm run test -w @app/sync-api -- --run tests/schema.test.ts
```

After implementation, rerun the same commands and relevant typechecks. Commit with:

```text
feat: scope books to grade levels
```

## Report contract

Write the complete report to `.superpowers/sdd/task-1-report.md` including:

- status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED;
- RED commands and exact expected failure reasons;
- changed files and key decisions;
- GREEN commands and pass counts;
- commit hash;
- self-review and concerns.

Return only status, commit hash, one-line test summary, and concerns.
