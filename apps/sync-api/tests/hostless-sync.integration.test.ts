import { resolve } from "node:path";

import type {
  SyncCommand,
  SyncCommandResult,
} from "@app/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const databaseUrl = process.env.HOSTLESS_TEST_DATABASE_URL;
const clientDatabaseUrl = process.env.HOSTLESS_TEST_CLIENT_DATABASE_URL ?? databaseUrl;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const at = (second: number) => `2026-07-13T00:00:${String(second).padStart(2, "0")}.000Z`;
type PullResponse = {
  changes: Array<{
    sequence: number;
    commandId: string;
    entityTable: string;
    entityId: string;
    payloadJson: string;
    createdAt: string;
  }>;
  nextCursor: string;
};

describeWithPostgres("hostless sync PostgreSQL contract", () => {
  const ownerSql = postgres(databaseUrl!, { max: 1 });
  const sql = postgres(clientDatabaseUrl!, { max: 8 });

  beforeAll(async () => {
    const migrationSql = postgres(databaseUrl!, { max: 1 });
    try {
      await migrate(drizzle(migrationSql), {
        migrationsFolder: resolve(process.cwd(), "drizzle"),
      });
    } finally {
      await migrationSql.end({ timeout: 5 });
    }
  });

  beforeEach(async () => {
    await ownerSql`TRUNCATE TABLE
      inventory_transaction_items,
      student_books,
      inventory_transactions,
      students,
      books,
      academic_years,
      sync_outbox,
      sync_state,
      app_settings,
      sync_changes,
      applied_sync_commands
      RESTART IDENTITY`;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await ownerSql.end({ timeout: 5 });
  });

  async function push(commands: SyncCommand[]) {
    const parameter = sql.json(commands);
    const [row] = await sql<{ payload: { results: SyncCommandResult[] } }[]>`
      SELECT sync_api.sync_push(${parameter}::jsonb) AS payload
    `;
    return row.payload.results;
  }

  async function pull(since: number) {
    const [row] = await sql<{ payload: PullResponse }[]>`
      SELECT sync_api.sync_pull(${since}::bigint) AS payload
    `;
    return row.payload;
  }

  it("applies all command types and pulls deletion tombstones", async () => {
    const commands: SyncCommand[] = [
      {
        id: "year-init",
        type: "INITIALIZE_ACADEMIC_YEAR",
        deviceId: "device-a",
        occurredAt: at(1),
        academicYear: "2025-2026",
      },
      {
        id: "book-upsert",
        type: "UPSERT_BOOK",
        deviceId: "device-a",
        occurredAt: at(2),
        book: {
          id: "book-1",
          name: "English",
          educationStage: "primary",
          gradeLevel: "primary1",
        },
      },
      {
        id: "student-upsert",
        type: "UPSERT_STUDENT",
        deviceId: "device-a",
        occurredAt: at(3),
        student: {
          id: "student-1",
          name: "Ahmed",
          governmentId: "G-1",
          educationStage: "primary",
          gradeLevel: "primary1",
          academicYear: "2025-2026",
          previousStudentId: null,
        },
      },
      {
        id: "stock-add",
        type: "ADD_BOOK_STOCK",
        deviceId: "device-a",
        occurredAt: at(4),
        academicYear: "2025-2026",
        bookId: "book-1",
        semester: "first",
        quantity: 2,
        receiptNumber: "R-1",
        receiptDate: "2026-07-13",
      },
      {
        id: "issue",
        type: "ISSUE_BOOKS_TO_STUDENT",
        deviceId: "device-a",
        occurredAt: at(5),
        academicYear: "2025-2026",
        studentId: "student-1",
        bookSelections: [{ bookId: "book-1", semester: "first" }],
      },
      {
        id: "reverse",
        type: "REVERSE_TRANSACTION",
        deviceId: "device-a",
        occurredAt: at(6),
        academicYear: "2025-2026",
        transactionId: "issue",
      },
      {
        id: "student-delete",
        type: "DELETE_STUDENT",
        deviceId: "device-a",
        occurredAt: at(7),
        academicYear: "2025-2026",
        studentId: "student-1",
      },
      {
        id: "book-delete",
        type: "DELETE_BOOK",
        deviceId: "device-a",
        occurredAt: at(8),
        bookId: "book-1",
      },
      {
        id: "year-advance",
        type: "ADVANCE_ACADEMIC_YEAR",
        deviceId: "device-a",
        occurredAt: at(9),
        fromYear: "2025-2026",
        toYear: "2026-2027",
        promotedStudents: [],
      },
    ];

    const results = await push(commands);

    expect(results).toHaveLength(commands.length);
    expect(results.every(({ status }) => status === "accepted")).toBe(true);
    await expect(push([commands[0]!])).resolves.toEqual([
      { commandId: "year-init", status: "duplicate" },
    ]);

    const response = await pull(0);
    expect(Number(response.nextCursor)).toBeGreaterThan(0);
    expect(response.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ commandId: "student-delete", entityTable: "students" }),
      expect.objectContaining({ commandId: "book-delete", entityTable: "books" }),
    ]));
    const tombstones = response.changes
      .filter(({ commandId }) => commandId === "student-delete" || commandId === "book-delete")
      .map(({ payloadJson }) => JSON.parse(payloadJson) as { deletedAt: string | null });
    expect(tombstones.every(({ deletedAt }) => deletedAt !== null)).toBe(true);
  });

  it("returns stable business rejections and validates grade eligibility", async () => {
    await push([{
      id: "year-init",
      type: "INITIALIZE_ACADEMIC_YEAR",
      deviceId: "device-a",
      occurredAt: at(1),
      academicYear: "2025-2026",
    }]);

    const invalidGrade: SyncCommand = {
      id: "invalid-grade",
      type: "UPSERT_BOOK",
      deviceId: "device-a",
      occurredAt: at(2),
      book: {
        id: "book-1",
        name: "English",
        educationStage: "primary",
        gradeLevel: "preparatory1",
      },
    };
    const rejected = await push([invalidGrade]);

    expect(rejected).toEqual([expect.objectContaining({
      commandId: "invalid-grade",
      status: "rejected",
      reasonCode: "VALIDATION_FAILED",
    })]);
    await expect(push([invalidGrade])).resolves.toEqual(rejected);
  });

  it("serializes concurrent issue commands so stock never becomes negative", async () => {
    await push([
      {
        id: "year-init",
        type: "INITIALIZE_ACADEMIC_YEAR",
        deviceId: "device-a",
        occurredAt: at(1),
        academicYear: "2025-2026",
      },
      {
        id: "book-upsert",
        type: "UPSERT_BOOK",
        deviceId: "device-a",
        occurredAt: at(2),
        book: {
          id: "book-1",
          name: "English",
          educationStage: "primary",
          gradeLevel: "primary1",
        },
      },
      ...["1", "2"].map((suffix, index): SyncCommand => ({
        id: `student-${suffix}`,
        type: "UPSERT_STUDENT",
        deviceId: "device-a",
        occurredAt: at(3 + index),
        student: {
          id: `student-${suffix}`,
          name: `Student ${suffix}`,
          governmentId: `G-${suffix}`,
          educationStage: "primary",
          gradeLevel: "primary1",
          academicYear: "2025-2026",
          previousStudentId: null,
        },
      })),
      {
        id: "stock-add",
        type: "ADD_BOOK_STOCK",
        deviceId: "device-a",
        occurredAt: at(5),
        academicYear: "2025-2026",
        bookId: "book-1",
        semester: "first",
        quantity: 1,
        receiptNumber: "R-1",
        receiptDate: "2026-07-13",
      },
    ]);

    const issue = (suffix: string): SyncCommand => ({
      id: `issue-${suffix}`,
      type: "ISSUE_BOOKS_TO_STUDENT",
      deviceId: `device-${suffix}`,
      occurredAt: at(6 + Number(suffix)),
      academicYear: "2025-2026",
      studentId: `student-${suffix}`,
      bookSelections: [{ bookId: "book-1", semester: "first" }],
    });

    const results = (await Promise.all([
      push([issue("1")]),
      push([issue("2")]),
    ])).flat();

    expect(results.map(({ status }) => status).sort()).toEqual(["accepted", "rejected"]);
    const [book] = await ownerSql<{ quantity: number }[]>`
      SELECT first_semester_quantity AS quantity FROM books WHERE id = 'book-1'
    `;
    expect(book.quantity).toBe(0);
  });
});
