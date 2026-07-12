import { describe, expect, it } from "vitest";

import { countOutboxRowsByStatus, listPendingOutboxRows } from "../db/repositories/outbox";
import { createTestDatabase } from "../db/test-database";
import { createUpdaterController } from "../updater/updater-controller";
import { createDatabaseBackend } from "./tauri-backend";

describe("database backend", () => {
  it("composes persisted year, semester, receipt, log, and sync workflows", async () => {
    const database = createTestDatabase();
    const ids = [
      "initialize-command", "student-1", "student-command", "book-1", "book-command",
      "stock-command", "stock-transaction", "stock-item",
      "issue-command", "issue-transaction", "issue-item", "student-book-1",
    ];
    const backend = createDatabaseBackend({
      database,
      client: {
        push: async (commands) => commands.map(({ id }) => ({ commandId: id, status: "accepted" as const })),
        pull: async () => ({ changes: [], nextCursor: "0" }),
      },
      updater: createUpdaterController({
        currentVersion: "0.1.0", enabled: false,
        loadClient: async () => ({ check: async () => null }),
      }),
      autoSync: false,
      now: () => "2026-01-14T10:00:00.000Z",
      createId: () => ids.shift() ?? (() => { throw new Error("Missing test ID"); })(),
    });

    await backend.initialize();
    await backend.initializeAcademicYear("2025-2026");
    const student = await backend.saveStudent({
      name: "Mona Ahmed", governmentId: "29801011234567",
      educationStage: "primary", gradeLevel: "primary1", academicYear: "2025-2026",
    });
    const [book] = await backend.saveBooks({ name: "Primary Math", educationStage: "primary", gradeLevels: ["primary1"] });
    await backend.addStock({
      academicYear: "2025-2026", bookId: book.id, semester: "first", quantity: 2,
      receiptNumber: "00041", receiptDate: "2026-01-14",
    });
    await backend.issueBooks({
      academicYear: "2025-2026", studentId: student.id,
      bookSelections: [{ bookId: book.id, semester: "first" }],
    });

    expect(await backend.listLogs("2025-2026")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "student_issue", studentName: "Mona Ahmed" }),
      expect.objectContaining({
        type: "stock_increase", receiptNumber: "00041",
        items: [expect.objectContaining({ bookName: "Primary Math", semester: "first" })],
      }),
    ]));
    expect(await countOutboxRowsByStatus(database, "pending")).toBe(5);
    await backend.requestSync();
    expect(await countOutboxRowsByStatus(database, "synced")).toBe(5);
    database.close();
  });

  it("queries a book's inventory history without an academic-year filter", async () => {
    const database = createTestDatabase();
    let id = 0;
    const backend = createDatabaseBackend({
      database,
      client: {
        push: async (commands) => commands.map(({ id: commandId }) => ({ commandId, status: "accepted" as const })),
        pull: async () => ({ changes: [], nextCursor: "0" }),
      },
      updater: createUpdaterController({
        currentVersion: "0.1.0", enabled: false,
        loadClient: async () => ({ check: async () => null }),
      }),
      autoSync: false,
      now: () => `2026-01-${String(++id).padStart(2, "0")}T10:00:00.000Z`,
      createId: () => `id-${++id}`,
    });
    await backend.initialize();
    await backend.initializeAcademicYear("2025-2026");
    const [book] = await backend.saveBooks({ name: "Math", educationStage: "primary", gradeLevels: ["primary1"] });
    await backend.addStock({
      academicYear: "2025-2026", bookId: book.id, semester: "first", quantity: 3,
      receiptNumber: "R-41", receiptDate: "2026-01-14",
    });
    await backend.requestSync();
    await backend.advanceAcademicYear("2026-2027");
    await backend.addStock({
      academicYear: "2026-2027", bookId: book.id, semester: "second", quantity: 2,
      receiptNumber: "R-92", receiptDate: "2026-09-01",
    });

    expect(await backend.listBookHistory(book.id)).toEqual([
      expect.objectContaining({
        academicYear: "2026-2027", semester: "second", receiptNumber: "R-92",
      }),
      expect.objectContaining({
        academicYear: "2025-2026", semester: "first", receiptNumber: "R-41",
      }),
    ]);
    database.close();
  });

  it("composes multi-grade creation and tombstones while retaining log names", async () => {
    const database = createTestDatabase();
    let id = 0;
    const backend = createDatabaseBackend({
      database,
      client: {
        push: async (commands) => commands.map(({ id: commandId }) => ({
          commandId,
          status: "accepted" as const,
        })),
        pull: async () => ({ changes: [], nextCursor: "0" }),
      },
      updater: createUpdaterController({
        currentVersion: "0.1.0",
        enabled: false,
        loadClient: async () => ({ check: async () => null }),
      }),
      autoSync: false,
      now: () => "2026-01-14T10:00:00.000Z",
      createId: () => `id-${++id}`,
    });
    await backend.initialize();
    await backend.initializeAcademicYear("2025-2026");
    const student = await backend.saveStudent({
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary",
      gradeLevel: "primary1",
      academicYear: "2025-2026",
    });
    const [book, sibling] = await backend.saveBooks({
      name: "Primary Math",
      educationStage: "primary",
      gradeLevels: ["primary1", "primary2"],
    });
    await backend.addStock({
      academicYear: "2025-2026",
      bookId: book.id,
      semester: "first",
      quantity: 1,
      receiptNumber: "R-1",
      receiptDate: "2026-01-14",
    });
    await backend.issueBooks({
      academicYear: "2025-2026",
      studentId: student.id,
      bookSelections: [{ bookId: book.id, semester: "first" }],
    });

    await backend.deleteStudent(student.id, "2025-2026");
    await backend.deleteBook(book.id);

    expect(await backend.listStudents("2025-2026")).toEqual([]);
    expect(await backend.listBooks()).toEqual([expect.objectContaining({ id: sibling.id })]);
    expect(await backend.listLogs("2025-2026")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "student_issue",
        studentName: "Mona Ahmed",
        items: [expect.objectContaining({ bookName: "Primary Math" })],
      }),
    ]));
    expect((await listPendingOutboxRows(database)).map(({ commandType }) => commandType))
      .toEqual(expect.arrayContaining(["DELETE_STUDENT", "DELETE_BOOK"]));
    database.close();
  });
});
