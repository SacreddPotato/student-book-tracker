import { describe, expect, expectTypeOf, it } from "vitest";

import { createFixtureBackend } from "./fixture-backend";
import type { AppBackend, BookInput } from "./types";

describe("fixture backend", () => {
  it("keeps the temporary legacy adapter deterministic without weakening BookInput", async () => {
    expectTypeOf<Parameters<AppBackend["saveBooks"]>[0]>().toEqualTypeOf<BookInput>();
    const backend = createFixtureBackend();
    const legacyInput = {
      name: "Primary Math",
      educationStage: "primary" as const,
      gradeLevels: ["preparatory1"],
    };

    const book = await backend.saveBook(legacyInput);

    expect(book.gradeLevel).toBe("primary1");
  });

  it("supports semester inventory and current-year lifecycle", async () => {
    const backend = createFixtureBackend();
    await backend.initialize();
    await backend.initializeAcademicYear("2025-2026");
    const student = await backend.saveStudent({
      name: "Mona Ahmed", governmentId: "29801011234567",
      educationStage: "primary", gradeLevel: "primary1", academicYear: "2025-2026",
    });
    const book = await backend.saveBook({ name: "Primary Math", educationStage: "primary" });
    expect(book.gradeLevel).toBe("primary1");
    await backend.addStock({
      academicYear: "2025-2026", bookId: book.id, semester: "second", quantity: 2,
      receiptNumber: "00041", receiptDate: "2026-01-14",
    });
    await backend.issueBooks({
      academicYear: "2025-2026", studentId: student.id,
      bookSelections: [{ bookId: book.id, semester: "second" }],
    });

    expect(await backend.listBooks()).toEqual([
      expect.objectContaining({ id: book.id, firstSemesterQuantity: 0, secondSemesterQuantity: 1 }),
    ]);
    expect(await backend.listIssuedBooks("2025-2026", student.id)).toEqual([
      expect.objectContaining({ semester: "second" }),
    ]);
    const issue = (await backend.listLogs("2025-2026"))
      .find(({ type }) => type === "student_issue")!;
    await backend.reverseTransaction("2025-2026", issue.id);

    expect((await backend.listBooks())[0]?.secondSemesterQuantity).toBe(2);
    expect(await backend.listIssuedBooks("2025-2026", student.id)).toEqual([]);
  });

  it("advances student snapshots while preserving archived records and books", async () => {
    const backend = createFixtureBackend();
    await backend.initializeAcademicYear("2025-2026");
    const student = await backend.saveStudent({
      name: "Mona", governmentId: "1", educationStage: "kg", gradeLevel: "kg2",
      academicYear: "2025-2026",
    });
    const book = await backend.saveBook({ name: "Arabic", educationStage: "primary" });
    await backend.addStock({
      academicYear: "2025-2026", bookId: book.id, semester: "first", quantity: 3,
      receiptNumber: "1", receiptDate: "2026-01-14",
    });

    await backend.advanceAcademicYear("2026-2027");

    expect(await backend.listStudents("2025-2026")).toEqual([
      expect.objectContaining({ id: student.id, gradeLevel: "kg2" }),
    ]);
    expect(await backend.listStudents("2026-2027")).toEqual([
      expect.objectContaining({ previousStudentId: student.id, gradeLevel: "primary1" }),
    ]);
    expect((await backend.listBooks())[0]?.firstSemesterQuantity).toBe(3);
    expect(await backend.listLogs("2026-2027")).toEqual([]);
  });

  it("keeps preview updater disabled and exposes sync status", async () => {
    const backend = createFixtureBackend();
    await backend.updater.check();
    expect(backend.updater.store.getSnapshot().phase).toBe("disabled");
    expect(backend.syncStore.getSnapshot().phase).toBe("synced");
  });

  it("projects one book's receipt, issuance, and reversal history across years", async () => {
    const backend = createFixtureBackend();
    await backend.initializeAcademicYear("2025-2026");
    const student = await backend.saveStudent({
      name: "Mona", governmentId: "1", educationStage: "primary",
      gradeLevel: "primary1", academicYear: "2025-2026",
    });
    const book = await backend.saveBook({ name: "Math", educationStage: "primary" });
    await backend.addStock({
      academicYear: "2025-2026", bookId: book.id, semester: "first", quantity: 3,
      receiptNumber: "R-41", receiptDate: "2026-01-14",
    });
    await backend.issueBooks({
      academicYear: "2025-2026", studentId: student.id,
      bookSelections: [{ bookId: book.id, semester: "first" }],
    });
    const issue = (await backend.listLogs("2025-2026"))
      .find(({ type }) => type === "student_issue")!;
    await backend.reverseTransaction("2025-2026", issue.id);
    await backend.advanceAcademicYear("2026-2027");
    await backend.addStock({
      academicYear: "2026-2027", bookId: book.id, semester: "second", quantity: 2,
      receiptNumber: "R-92", receiptDate: "2026-09-01",
    });

    const history = await backend.listBookHistory(book.id);

    expect(history.map(({ type }) => type)).toEqual([
      "stock_increase", "reversal", "student_issue", "stock_increase",
    ]);
    expect(history[0]).toEqual(expect.objectContaining({
      academicYear: "2026-2027", semester: "second", quantityDelta: 2,
      receiptNumber: "R-92", receiptDate: "2026-09-01", studentName: null,
    }));
    expect(history[1]).toEqual(expect.objectContaining({
      academicYear: "2025-2026", type: "reversal", reversedTransactionId: issue.id,
    }));
    expect(history[2]).toEqual(expect.objectContaining({
      studentName: "Mona", semester: "first", quantityDelta: -1,
      reversedByTransactionId: history[1]?.transactionId,
    }));
  });

  it("mirrors grade-scoped creation and tombstones while retaining log names", async () => {
    const backend = createFixtureBackend();
    await backend.initializeAcademicYear("2025-2026");
    const student = await backend.saveStudent({
      name: "Mona Ahmed",
      governmentId: "1",
      educationStage: "primary",
      gradeLevel: "primary1",
      academicYear: "2025-2026",
    });
    const created = await backend.saveBooks({
      name: "Primary Math",
      educationStage: "primary",
      gradeLevels: ["primary1", "primary2"],
    });
    expect(created.map(({ gradeLevel }) => gradeLevel)).toEqual(["primary1", "primary2"]);
    await expect(backend.saveBooks({
      name: "Invalid",
      educationStage: "primary",
      gradeLevels: ["preparatory1"],
    })).rejects.toThrow(/grade level/i);
    const book = created[0]!;
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
    await expect(backend.deleteStudent(student.id, "2024-2025"))
      .rejects.toThrow(/archived/i);

    await backend.deleteStudent(student.id, "2025-2026");
    await backend.deleteBook(book.id);

    expect(await backend.listStudents("2025-2026")).toEqual([]);
    expect(await backend.listBooks()).toEqual([
      expect.objectContaining({ id: created[1]!.id, gradeLevel: "primary2" }),
    ]);
    expect(await backend.listLogs("2025-2026")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "student_issue",
        studentName: "Mona Ahmed",
        items: [expect.objectContaining({ bookName: "Primary Math" })],
      }),
    ]));
  });
});
