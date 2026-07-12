import type { GradeLevel } from "@app/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import { runMigrations } from "../db/migrations";
import { createInitialAcademicYear } from "../db/repositories/academic-years";
import {
  listBookRecords,
  listBooks,
  updateBookSemesterQuantity,
} from "../db/repositories/books";
import { listPendingOutboxRows } from "../db/repositories/outbox";
import { listStudentRecords, listStudents } from "../db/repositories/students";
import { deleteBook, deleteStudent, saveBooks, saveStudent } from "./entity-service";

const fixedNow = "2026-07-08T10:00:00.000Z";

describe("entity service", () => {
  let database: TestSqliteDatabase;
  let ids: string[];

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
    await createInitialAcademicYear(database, "2025-2026", fixedNow);
    ids = ["entity-1", "command-1"];
  });

  afterEach(() => database.close());

  const context = () => ({
    database,
    deviceId: "device-1",
    now: () => fixedNow,
    createId: () => ids.shift() ?? (() => { throw new Error("Missing test ID"); })(),
  });

  it("saves a student and its UPSERT command atomically", async () => {
    await saveStudent(
      {
        name: " Mona Ahmed ",
        governmentId: "29801011234567",
        educationStage: "primary",
        gradeLevel: "primary1",
        academicYear: "2025-2026",
      },
      context(),
    );

    expect(await listStudents(database, "2025-2026")).toEqual([
      expect.objectContaining({ id: "entity-1", name: "Mona Ahmed" }),
    ]);
    expect(await listPendingOutboxRows(database)).toEqual([
      expect.objectContaining({ id: "command-1", commandType: "UPSERT_STUDENT" }),
    ]);
  });

  it("rejects a grade that does not belong to the selected stage", async () => {
    await expect(
      saveStudent(
        {
          name: "Mona Ahmed",
          governmentId: "29801011234567",
          educationStage: "primary",
          gradeLevel: "preparatory1",
          academicYear: "2025-2026",
        },
        context(),
      ),
    ).rejects.toThrow("grade level");
    expect(await listStudents(database, "2025-2026")).toEqual([]);
    expect(await listPendingOutboxRows(database)).toEqual([]);
  });

  it("creates one independent zero-stock book and command per selected grade", async () => {
    ids = ["book-1", "command-1", "book-2", "command-2"];
    const rows = await saveBooks({
      name: " Primary Math ",
      educationStage: "primary",
      gradeLevels: ["primary1", "primary2"],
    }, context());

    expect(rows).toEqual([
      expect.objectContaining({
        id: "book-1", name: "Primary Math", gradeLevel: "primary1",
        firstSemesterQuantity: 0, secondSemesterQuantity: 0,
      }),
      expect.objectContaining({
        id: "book-2", name: "Primary Math", gradeLevel: "primary2",
        firstSemesterQuantity: 0, secondSemesterQuantity: 0,
      }),
    ]);
    expect(await listBooks(database)).toEqual(rows);
    const outbox = await listPendingOutboxRows(database);
    expect(outbox).toHaveLength(2);
    expect(outbox.map(({ id, commandType }) => ({ id, commandType }))).toEqual([
      { id: "command-1", commandType: "UPSERT_BOOK" },
      { id: "command-2", commandType: "UPSERT_BOOK" },
    ]);
    expect(outbox.map(({ payloadJson }) => JSON.parse(payloadJson).book.gradeLevel))
      .toEqual(["primary1", "primary2"]);
  });

  it.each([
    ["empty", []],
    ["duplicate", ["primary1", "primary1"]],
    ["incompatible", ["primary1", "preparatory1"]],
  ] as const)("rejects %s grade selections without creating rows or commands", async (
    _case,
    gradeLevels,
  ) => {
    await expect(saveBooks({
      name: "Primary Math",
      educationStage: "primary",
      gradeLevels: [...gradeLevels] as GradeLevel[],
    }, context())).rejects.toThrow();

    expect(await listBooks(database)).toEqual([]);
    expect(await listPendingOutboxRows(database)).toEqual([]);
  });

  it("edits exactly one book while preserving balances and creation time", async () => {
    ids = ["book-1", "create-command", "edit-command"];
    const [created] = await saveBooks({
      name: "Math",
      educationStage: "primary",
      gradeLevels: ["primary1"],
    }, context());
    await updateBookSemesterQuantity(database, created.id, "first", 7, fixedNow);
    await updateBookSemesterQuantity(database, created.id, "second", 3, fixedNow);

    const [edited] = await saveBooks({
      id: created.id,
      name: "Mathematics",
      educationStage: "primary",
      gradeLevels: ["primary2"],
    }, context());

    expect(edited).toEqual(expect.objectContaining({
      id: created.id,
      gradeLevel: "primary2",
      firstSemesterQuantity: 7,
      secondSemesterQuantity: 3,
      createdAt: created.createdAt,
    }));
    expect(await listBooks(database)).toEqual([edited]);
    await expect(saveBooks({
      id: created.id,
      name: "Mathematics",
      educationStage: "primary",
      gradeLevels: ["primary2", "primary3"],
    }, context())).rejects.toThrow(/exactly one grade/i);
    expect(await listBooks(database)).toEqual([edited]);
  });

  it("tombstones a current-year student and queues DELETE_STUDENT atomically", async () => {
    ids = ["student-1", "upsert-command", "delete-command"];
    await saveStudent({
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
      academicYear: "2025-2026",
    }, context());

    await deleteStudent("student-1", "2025-2026", context());

    expect(await listStudents(database, "2025-2026")).toEqual([]);
    expect(await listStudentRecords(database, "2025-2026")).toEqual([
      expect.objectContaining({
        id: "student-1",
        deletedAt: fixedNow,
        updatedAt: fixedNow,
      }),
    ]);
    expect((await listPendingOutboxRows(database)).at(-1)).toEqual(
      expect.objectContaining({ id: "delete-command", commandType: "DELETE_STUDENT" }),
    );
  });

  it("rejects mismatched student deletion without a tombstone or command", async () => {
    ids = ["student-1", "upsert-command", "unused-command"];
    await saveStudent({
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
      academicYear: "2025-2026",
    }, context());

    await expect(deleteStudent("student-1", "2024-2025", context()))
      .rejects.toThrow(/current academic year/i);

    expect(await listStudents(database, "2025-2026")).toHaveLength(1);
    expect(await listStudentRecords(database, "2025-2026")).toEqual([
      expect.objectContaining({ id: "student-1", deletedAt: null }),
    ]);
    expect(await listPendingOutboxRows(database)).toHaveLength(1);
  });

  it("tombstones a book and queues DELETE_BOOK while record lookup retains it", async () => {
    ids = ["book-1", "upsert-command", "delete-command"];
    await saveBooks({
      name: "Math",
      educationStage: "primary",
      gradeLevels: ["primary1"],
    }, context());

    await deleteBook("book-1", context());

    expect(await listBooks(database)).toEqual([]);
    expect(await listBookRecords(database)).toEqual([
      expect.objectContaining({
        id: "book-1",
        deletedAt: fixedNow,
        updatedAt: fixedNow,
      }),
    ]);
    expect((await listPendingOutboxRows(database)).at(-1)).toEqual(
      expect.objectContaining({ id: "delete-command", commandType: "DELETE_BOOK" }),
    );
  });
});
