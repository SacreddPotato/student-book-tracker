import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import { runMigrations } from "../db/migrations";
import { createInitialAcademicYear } from "../db/repositories/academic-years";
import { listBooks } from "../db/repositories/books";
import { listPendingOutboxRows } from "../db/repositories/outbox";
import { listStudents } from "../db/repositories/students";
import { saveBook, saveStudent } from "./entity-service";

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

  it("creates a zero-quantity book and its UPSERT command", async () => {
    await saveBook(
      { name: " Primary Math ", educationStage: "primary" },
      context(),
    );

    expect(await listBooks(database)).toEqual([
      expect.objectContaining({
        id: "entity-1", name: "Primary Math", gradeLevel: "primary1",
        firstSemesterQuantity: 0, secondSemesterQuantity: 0,
      }),
    ]);
    expect(await listPendingOutboxRows(database)).toEqual([
      expect.objectContaining({ id: "command-1", commandType: "UPSERT_BOOK" }),
    ]);
  });
});
