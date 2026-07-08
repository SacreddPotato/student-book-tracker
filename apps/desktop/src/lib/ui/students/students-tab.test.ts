// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { DatabaseSync } from "node:sqlite";
import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EducationStage, GradeLevel } from "@app/shared";

import type { SqlDatabase, SqlValue } from "../../db/local-db";
import { runMigrations } from "../../db/migrations";
import { listBooks, upsertBook } from "../../db/repositories/books";
import { listPendingOutboxRows } from "../../db/repositories/outbox";
import { upsertStudent } from "../../db/repositories/students";
import StudentsTab from "./StudentsTab.svelte";

class TestSqliteDatabase implements SqlDatabase {
  readonly db = new DatabaseSync(":memory:");

  async execute(sql: string, values: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(toSqliteBindings(values));
  }

  async select<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(toSqliteBindings(values)) as T[];
  }

  close(): void {
    this.db.close();
  }
}

function toSqliteBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}

const fixedNow = "2026-07-08T10:00:00.000Z";

function createIdSequence(ids: string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;

    if (!id) {
      throw new Error("Test ran out of deterministic IDs.");
    }

    return id;
  };
}

async function seedStudent(
  database: SqlDatabase,
  student: {
    id: string;
    name: string;
    governmentId: string;
    educationStage: EducationStage;
    gradeLevel: GradeLevel;
  },
): Promise<void> {
  await upsertStudent(database, {
    ...student,
    scopeId: "global",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  });
}

async function seedBook(
  database: SqlDatabase,
  book: { id: string; name: string; educationStage: EducationStage; quantity: number },
): Promise<void> {
  await upsertBook(database, {
    ...book,
    scopeId: "global",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  });
}

async function listIssuedBooks(database: SqlDatabase): Promise<Array<{ studentId: string; bookId: string }>> {
  return database.select<{ studentId: string; bookId: string }>(
    `SELECT student_id AS studentId, book_id AS bookId
    FROM student_books
    WHERE reversed_at IS NULL
    ORDER BY student_id, book_id`,
  );
}

describe("StudentsTab", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = new TestSqliteDatabase();
    await runMigrations(database);
  });

  afterEach(() => {
    database.close();
  });

  it("shows only the student-empty message when no students exist", async () => {
    render(StudentsTab, { props: { database } });

    expect(await screen.findByText("No students yet")).toBeInTheDocument();
    expect(screen.queryByText("Select a student to issue books")).not.toBeInTheDocument();
  });

  it("shows the select-student prompt when students exist but none is selected", async () => {
    await seedStudent(database, {
      id: "student-1",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
    });

    render(StudentsTab, { props: { database } });

    expect(await screen.findByRole("row", { name: /Mona Ahmed/i })).toBeInTheDocument();
    expect(screen.getByText("Select a student to issue books")).toBeInTheDocument();
  });

  it("uses a student-specific load error instead of the generic validation message", async () => {
    render(StudentsTab, {
      props: {
        database: {
          execute: async () => undefined,
          select: async () => {
            throw new Error("database unavailable");
          },
        },
      },
    });

    expect(await screen.findByText("Could not load students.")).toBeInTheDocument();
    expect(screen.queryByText("Validation failed")).not.toBeInTheDocument();
  });

  it("creates and edits students with stage-specific grades and grouped filters", async () => {
    const user = userEvent.setup();
    render(StudentsTab, {
      props: {
        database,
        createId: createIdSequence(["student-1"]),
        now: () => fixedNow,
      },
    });

    await user.click(screen.getByRole("button", { name: "Add student" }));
    await user.type(screen.getByLabelText("Student name"), "Mona Ahmed");
    await user.type(screen.getByLabelText("Government ID"), "29801011234567");
    await user.selectOptions(screen.getByLabelText("Education stage"), "kg");

    const gradeLevelSelect = screen.getByLabelText("Grade level");
    expect(within(gradeLevelSelect).getByRole("option", { name: "KG 1" })).toBeInTheDocument();
    expect(within(gradeLevelSelect).queryByRole("option", { name: "1st Primary" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Grade level"), "kg2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("row", { name: /Mona Ahmed/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Stage group"), "primary");
    expect(screen.queryByRole("row", { name: /Mona Ahmed/i })).not.toBeInTheDocument();
    expect(screen.getByText("No students match these groups")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Stage group"), "kg");
    await user.selectOptions(screen.getByLabelText("Grade group"), "kg2");
    const row = await screen.findByRole("row", { name: /Mona Ahmed/i });
    await user.click(within(row).getByRole("button", { name: /Edit Mona Ahmed/i }));
    await user.clear(screen.getByLabelText("Student name"));
    await user.type(screen.getByLabelText("Student name"), "Mona Ali");
    await user.selectOptions(screen.getByLabelText("Education stage"), "primary");
    await user.selectOptions(screen.getByLabelText("Grade level"), "primary1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.selectOptions(screen.getByLabelText("Stage group"), "primary");
    await user.selectOptions(screen.getByLabelText("Grade group"), "primary1");
    expect(await screen.findByRole("row", { name: /Mona Ali/i })).toBeInTheDocument();
  });

  it("keeps checklist selections as drafts before Confirm and disables zero-stock books", async () => {
    const user = userEvent.setup();
    await seedStudent(database, {
      id: "student-1",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
    });
    await seedBook(database, {
      id: "book-1",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });
    await seedBook(database, {
      id: "book-empty",
      name: "Primary Science",
      educationStage: "primary",
      quantity: 0,
    });
    await seedBook(database, {
      id: "book-kg",
      name: "KG Alphabet",
      educationStage: "kg",
      quantity: 5,
    });

    render(StudentsTab, { props: { database } });

    const row = await screen.findByRole("row", { name: /Mona Ahmed/i });
    await user.click(within(row).getByRole("button", { name: /Select Mona Ahmed/i }));

    expect(await screen.findByLabelText("Primary Math")).toBeInTheDocument();
    expect(screen.queryByLabelText("KG Alphabet")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Primary Science")).toBeDisabled();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Primary Math"));

    expect(await listIssuedBooks(database)).toEqual([]);
    expect(await listBooks(database)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "book-1", quantity: 2 })]),
    );
  });

  it("confirms selected books by issuing them to the student and decrementing stock", async () => {
    const user = userEvent.setup();
    await seedStudent(database, {
      id: "student-1",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
    });
    await seedBook(database, {
      id: "book-1",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });

    render(StudentsTab, {
      props: {
        database,
        createId: createIdSequence([
          "issue-command",
          "issue-transaction",
          "issue-item",
          "student-book-1",
        ]),
        now: () => fixedNow,
        deviceId: "device-1",
      },
    });

    const row = await screen.findByRole("row", { name: /Mona Ahmed/i });
    await user.click(within(row).getByRole("button", { name: /Select Mona Ahmed/i }));
    await user.click(await screen.findByLabelText("Primary Math"));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await listIssuedBooks(database)).toEqual([
      { studentId: "student-1", bookId: "book-1" },
    ]);
    expect(await listBooks(database)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "book-1", quantity: 1 })]),
    );
    expect(JSON.parse((await listPendingOutboxRows(database))[0]?.payloadJson ?? "{}")).toEqual(
      expect.objectContaining({
        type: "ISSUE_BOOKS_TO_STUDENT",
        studentId: "student-1",
        bookIds: ["book-1"],
      }),
    );
    expect(await screen.findByText("Issued")).toBeInTheDocument();
  });

  it("warns before switching students when draft selections exist", async () => {
    const user = userEvent.setup();
    await seedStudent(database, {
      id: "student-1",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
    });
    await seedStudent(database, {
      id: "student-2",
      name: "Omar Adel",
      governmentId: "29901011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
    });
    await seedBook(database, {
      id: "book-1",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });

    render(StudentsTab, { props: { database } });

    await user.click(
      within(await screen.findByRole("row", { name: /Mona Ahmed/i })).getByRole("button", {
        name: /Select Mona Ahmed/i,
      }),
    );
    await user.click(await screen.findByLabelText("Primary Math"));
    await user.click(
      within(await screen.findByRole("row", { name: /Omar Adel/i })).getByRole("button", {
        name: /Select Omar Adel/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: "Unconfirmed selections" })).toBeInTheDocument();
    expect(screen.getByText("You have unconfirmed book selections.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Mona Ahmed" })).toBeInTheDocument();

    await user.click(
      within(await screen.findByRole("row", { name: /Omar Adel/i })).getByRole("button", {
        name: /Select Omar Adel/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Discard selection" }));

    expect(screen.getByRole("heading", { name: "Omar Adel" })).toBeInTheDocument();
    expect(await listIssuedBooks(database)).toEqual([]);
  });
});
