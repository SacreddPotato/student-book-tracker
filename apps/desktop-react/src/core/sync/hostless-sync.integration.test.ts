import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrations";
import { listAcademicYears } from "../db/repositories/academic-years";
import { listBookRecords } from "../db/repositories/books";
import { countOutboxRowsByStatus } from "../db/repositories/outbox";
import { listStudentRecords } from "../db/repositories/students";
import { getSyncState } from "../db/repositories/sync-state";
import { listInventoryTransactions } from "../db/repositories/transactions";
import { createTestDatabase, type TestSqliteDatabase } from "../db/test-database";
import { advanceAcademicYear, initializeAcademicYear } from "../services/academic-year-service";
import { deleteBook, deleteStudent, saveBooks, saveStudent } from "../services/entity-service";
import {
  addBookStock,
  issueBooksToStudent,
  reverseTransaction,
} from "../services/inventory-service";
import { createExternalStore } from "../state/external-store";
import { NeonDirectSyncClient } from "./neon-direct-client";
import { createNeonQuery } from "./neon-query";
import { initialSyncStatus, SyncEngine } from "./sync-engine";

const databaseUrl = process.env.HOSTLESS_TEST_DATABASE_URL;
const describeWithNeon = databaseUrl ? describe : describe.skip;

describeWithNeon("two-device hostless Neon convergence", () => {
  let deviceA: TestSqliteDatabase;
  let deviceB: TestSqliteDatabase;
  let client: NeonDirectSyncClient;
  const contextA = createContext("device-a", () => deviceA);
  const contextB = createContext("device-b", () => deviceB);

  beforeAll(async () => {
    client = new NeonDirectSyncClient(createNeonQuery(databaseUrl!));
    deviceA = createTestDatabase();
    deviceB = createTestDatabase();
    await Promise.all([runMigrations(deviceA), runMigrations(deviceB)]);
  });

  afterAll(() => {
    deviceA.close();
    deviceB.close();
  });

  it("queues offline work and converges the full lifecycle on both SQLite profiles", async () => {
    await initializeAcademicYear("2025-2026", contextA.value());
    await sync(deviceA);
    await sync(deviceB);

    const [book] = await saveBooks({
      name: "English",
      educationStage: "primary",
      gradeLevels: ["primary1"],
    }, contextA.value());
    await addBookStock({
      academicYear: "2025-2026",
      bookId: book.id,
      semester: "first",
      quantity: 2,
      receiptNumber: "LIVE-001",
      receiptDate: "2026-07-13",
    }, contextA.value());
    const student = await saveStudent({
      name: "Live Student",
      governmentId: "LIVE-001",
      educationStage: "primary",
      gradeLevel: "primary1",
      academicYear: "2025-2026",
    }, contextA.value());
    const issuance = await issueBooksToStudent({
      academicYear: "2025-2026",
      studentId: student.id,
      bookSelections: [{ bookId: book.id, semester: "first" }],
    }, contextA.value());
    await reverseTransaction({
      academicYear: "2025-2026",
      transactionId: issuance.id,
    }, contextA.value());
    await deleteStudent(student.id, "2025-2026", contextA.value());
    await deleteBook(book.id, contextA.value());

    await saveBooks({
      name: "Offline Mathematics",
      educationStage: "primary",
      gradeLevels: ["primary1"],
    }, contextB.value());
    expect(await countOutboxRowsByStatus(deviceB, "pending")).toBe(1);

    await advanceAcademicYear({
      toYear: "2026-2027",
      synchronized: true,
    }, contextA.value());
    await sync(deviceA);
    await sync(deviceB);
    await sync(deviceA);

    for (const database of [deviceA, deviceB]) {
      expect(await listAcademicYears(database)).toEqual([
        expect.objectContaining({ academicYear: "2026-2027", status: "current" }),
        expect.objectContaining({ academicYear: "2025-2026", status: "archived" }),
      ]);
      expect(await listBookRecords(database)).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "English", deletedAt: expect.any(String) }),
        expect.objectContaining({ name: "Offline Mathematics", deletedAt: null }),
      ]));
      expect(await listStudentRecords(database, "2025-2026")).toEqual([
        expect.objectContaining({ name: "Live Student", deletedAt: expect.any(String) }),
      ]);
      expect(await listInventoryTransactions(database, "2025-2026")).toHaveLength(3);
      expect(await countOutboxRowsByStatus(database, "pending")).toBe(0);
    }
    expect((await getSyncState(deviceA)).pullCursor)
      .toBe((await getSyncState(deviceB)).pullCursor);
  }, 60_000);

  async function sync(database: TestSqliteDatabase) {
    const store = createExternalStore(initialSyncStatus);
    await new SyncEngine({ database, client, store }).sync();
    expect(store.getSnapshot()).toMatchObject({ phase: "synced", pendingCount: 0 });
  }
});

function createContext(deviceId: string, database: () => TestSqliteDatabase) {
  let id = 0;
  let second = deviceId === "device-a" ? 0 : 40;
  return {
    value: () => ({
      database: database(),
      deviceId,
      createId: () => `${deviceId}-${String(id++).padStart(3, "0")}`,
      now: () => `2026-07-13T10:00:${String(second++).padStart(2, "0")}.000Z`,
    }),
  };
}
