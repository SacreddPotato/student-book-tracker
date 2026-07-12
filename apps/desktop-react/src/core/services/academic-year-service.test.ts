import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrations";
import { getCurrentAcademicYear, listAcademicYears } from "../db/repositories/academic-years";
import { upsertBook } from "../db/repositories/books";
import { listPendingOutboxRows } from "../db/repositories/outbox";
import { listStudents, upsertStudent } from "../db/repositories/students";
import { listActiveStudentBookRows, listInventoryTransactions } from "../db/repositories/transactions";
import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import { advanceAcademicYear, initializeAcademicYear } from "./academic-year-service";

const now = "2026-07-15T09:00:00.000Z";

describe("academic year service", () => {
  let database: TestSqliteDatabase;
  let ids: string[];

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
    ids = [];
  });
  afterEach(() => database.close());

  const context = () => ({
    database,
    deviceId: "device-1",
    now: () => now,
    createId: () => ids.shift() ?? (() => { throw new Error("Missing test ID"); })(),
  });

  it("initializes exactly one current academic year and enqueues sync", async () => {
    ids = ["initialize-command"];
    await initializeAcademicYear("2025-2026", context());

    expect(await getCurrentAcademicYear(database)).toEqual(
      expect.objectContaining({ academicYear: "2025-2026", status: "current" }),
    );
    expect(await listPendingOutboxRows(database)).toEqual([
      expect.objectContaining({ id: "initialize-command", commandType: "INITIALIZE_ACADEMIC_YEAR" }),
    ]);
    await expect(initializeAcademicYear("2026-2027", context()))
      .rejects.toThrow("already initialized");
  });

  it("promotes eligible snapshots, voids preparatory3, and preserves global books", async () => {
    ids = ["initialize-command"];
    await initializeAcademicYear("2025-2026", context());
    for (const [id, gradeLevel, educationStage] of [
      ["kg1-student", "kg1", "kg"],
      ["kg2-student", "kg2", "kg"],
      ["primary6-student", "primary6", "primary"],
      ["final-student", "preparatory3", "preparatory"],
    ] as const) {
      await upsertStudent(database, {
        id, scopeId: "global", name: id, governmentId: `${id}-gov`,
        educationStage, gradeLevel, academicYear: "2025-2026",
        previousStudentId: null, createdAt: now, updatedAt: now, deletedAt: null,
      });
    }
    await upsertBook(database, {
      id: "book-1", scopeId: "global", name: "Math", educationStage: "primary",
      gradeLevel: "primary1",
      firstSemesterQuantity: 9, secondSemesterQuantity: 4,
      createdAt: now, updatedAt: now, deletedAt: null,
    });
    ids = ["promoted-kg2", "promoted-primary1", "promoted-prep1", "advance-command"];

    const result = await advanceAcademicYear({
      toYear: "2026-2027",
      synchronized: true,
    }, context());

    expect(result).toEqual({
      fromYear: "2025-2026", toYear: "2026-2027", promotedCount: 3, voidedCount: 1,
    });
    expect(await listStudents(database, "2026-2027")).toEqual(expect.arrayContaining([
      expect.objectContaining({ gradeLevel: "kg2", previousStudentId: "kg1-student" }),
      expect.objectContaining({ gradeLevel: "primary1", previousStudentId: "kg2-student" }),
      expect.objectContaining({ gradeLevel: "preparatory1", previousStudentId: "primary6-student" }),
    ]));
    expect(await listStudents(database, "2026-2027")).toHaveLength(3);
    expect(await listStudents(database, "2025-2026")).toHaveLength(4);
    expect(await listActiveStudentBookRows(database, "2026-2027", "promoted-kg2")).toEqual([]);
    expect(await listInventoryTransactions(database, "2026-2027")).toEqual([]);
    expect(await database.select("SELECT first_semester_quantity, second_semester_quantity FROM books"))
      .toEqual([{ first_semester_quantity: 9, second_semester_quantity: 4 }]);
    expect(await listAcademicYears(database)).toEqual(expect.arrayContaining([
      expect.objectContaining({ academicYear: "2025-2026", status: "archived" }),
      expect.objectContaining({ academicYear: "2026-2027", status: "current" }),
    ]));
  });

  it("requires a synchronized state and the exact successor year", async () => {
    ids = ["initialize-command"];
    await initializeAcademicYear("2025-2026", context());
    await expect(advanceAcademicYear({ toYear: "2026-2027", synchronized: false }, context()))
      .rejects.toThrow("synchronized");
    await expect(advanceAcademicYear({ toYear: "2027-2028", synchronized: true }, context()))
      .rejects.toThrow("successor");
  });
});
