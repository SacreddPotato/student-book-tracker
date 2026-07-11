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
import {
  addBookStock,
  issueBooksToStudent,
  type InventoryServiceContext,
} from "../../services/inventory-service";
import LogsTab from "./LogsTab.svelte";

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

function createContext(
  database: SqlDatabase,
  ids: string[],
  now: () => string,
): InventoryServiceContext {
  let index = 0;

  return {
    database,
    deviceId: "device-1",
    now,
    createId: () => {
      const id = ids[index];
      index += 1;

      if (!id) {
        throw new Error("Test ran out of deterministic IDs.");
      }

      return id;
    },
  };
}

async function seedBook(
  database: SqlDatabase,
  book: { id: string; name: string; educationStage: EducationStage; quantity: number },
): Promise<void> {
  await upsertBook(database, {
    ...book,
    scopeId: "global",
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
    deletedAt: null,
  });
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
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
    deletedAt: null,
  });
}

async function listIssuedBookRows(
  database: SqlDatabase,
): Promise<Array<{ bookId: string; reversedAt: string | null }>> {
  return database.select<{ bookId: string; reversedAt: string | null }>(
    `SELECT book_id AS bookId, reversed_at AS reversedAt
    FROM student_books
    ORDER BY book_id`,
  );
}

describe("LogsTab", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = new TestSqliteDatabase();
    await runMigrations(database);
  });

  afterEach(() => {
    database.close();
  });

  it("displays shipment and student issue logs grouped by book and student with Cairo time and items", async () => {
    await seedStudent(database, {
      id: "student-1",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
    });
    await seedBook(database, {
      id: "book-math",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });
    await seedBook(database, {
      id: "book-science",
      name: "Primary Science",
      educationStage: "primary",
      quantity: 2,
    });

    await addBookStock(
      { bookId: "book-math", quantity: 5 },
      createContext(
        database,
        ["stock-command", "stock-transaction", "stock-item"],
        () => "2026-07-08T10:15:00.000Z",
      ),
    );
    await issueBooksToStudent(
      { studentId: "student-1", bookIds: ["book-math", "book-science"] },
      createContext(
        database,
        [
          "issue-command",
          "issue-transaction",
          "issue-item-math",
          "student-book-math",
          "issue-item-science",
          "student-book-science",
        ],
        () => "2026-07-08T11:00:00.000Z",
      ),
    );

    render(LogsTab, { props: { database } });

    const studentLog = await screen.findByRole("article", { name: /Mona Ahmed/i });
    expect(within(studentLog).getByText("Student issue")).toBeInTheDocument();
    expect(within(studentLog).getByText("Jul 8, 2026, 2:00 PM")).toBeInTheDocument();
    expect(within(studentLog).getByText("Primary Math")).toBeInTheDocument();
    expect(within(studentLog).getByText("Primary Science")).toBeInTheDocument();
    expect(within(studentLog).getAllByText("-1")).toHaveLength(2);

    const shipmentLog = await screen.findByRole("article", { name: /Primary Math/i });
    expect(within(shipmentLog).getByText("Shipment increase")).toBeInTheDocument();
    expect(within(shipmentLog).getByText("Jul 8, 2026, 1:15 PM")).toBeInTheDocument();
    expect(within(shipmentLog).getByText("+5")).toBeInTheDocument();
    expect(within(shipmentLog).getByText("After: 7")).toBeInTheDocument();
  });

  it("reverses a shipment log from the confirmation dialog and disables the original reverse action", async () => {
    const user = userEvent.setup();
    await seedBook(database, {
      id: "book-math",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });
    await addBookStock(
      { bookId: "book-math", quantity: 5 },
      createContext(
        database,
        ["stock-command", "stock-transaction", "stock-item"],
        () => "2026-07-08T10:15:00.000Z",
      ),
    );

    render(LogsTab, {
      props: {
        database,
        createId: createContext(
          database,
          ["reverse-command", "reverse-transaction", "reverse-item"],
          () => "2026-07-08T12:00:00.000Z",
        ).createId,
        now: () => "2026-07-08T12:00:00.000Z",
        deviceId: "device-1",
      },
    });

    const shipmentLog = await screen.findByRole("article", { name: /Primary Math/i });
    await user.click(within(shipmentLog).getByRole("button", { name: /Reverse Primary Math/i }));
    expect(screen.getByRole("dialog", { name: "Reverse transaction" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-math", quantity: 2 }),
    ]);
    expect(JSON.parse((await listPendingOutboxRows(database))[1]?.payloadJson ?? "{}")).toEqual(
      expect.objectContaining({
        type: "REVERSE_TRANSACTION",
        transactionId: "stock-transaction",
      }),
    );
    expect(
      within(await screen.findByRole("article", { name: /Primary Math/i })).getByRole("button", {
        name: "Already reversed",
      }),
    ).toBeDisabled();
    expect(await screen.findByRole("article", { name: /Reversal/i })).toBeInTheDocument();
  });

  it("reverses a student issue log, restores stock, and marks issued books reversed", async () => {
    const user = userEvent.setup();
    await seedStudent(database, {
      id: "student-1",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
    });
    await seedBook(database, {
      id: "book-math",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });
    await issueBooksToStudent(
      { studentId: "student-1", bookIds: ["book-math"] },
      createContext(
        database,
        ["issue-command", "issue-transaction", "issue-item", "student-book-math"],
        () => "2026-07-08T11:00:00.000Z",
      ),
    );

    render(LogsTab, {
      props: {
        database,
        createId: createContext(
          database,
          ["reverse-command", "reverse-transaction", "reverse-item"],
          () => "2026-07-08T12:00:00.000Z",
        ).createId,
        now: () => "2026-07-08T12:00:00.000Z",
        deviceId: "device-1",
      },
    });

    const studentLog = await screen.findByRole("article", { name: /Mona Ahmed/i });
    await user.click(within(studentLog).getByRole("button", { name: /Reverse Mona Ahmed/i }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await listBooks(database)).toEqual([
      expect.objectContaining({ id: "book-math", quantity: 2 }),
    ]);
    expect(await listIssuedBookRows(database)).toEqual([
      { bookId: "book-math", reversedAt: "2026-07-08T12:00:00.000Z" },
    ]);
    expect(
      within(await screen.findByRole("article", { name: /Mona Ahmed/i })).getByRole("button", {
        name: "Already reversed",
      }),
    ).toBeDisabled();
  });
});
