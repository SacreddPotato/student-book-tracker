import { describe, expect, it } from "vitest";

import { applyCommand } from "../src/services/apply-command";
import { MemorySyncStore } from "./memory-sync-store";

const occurredAt = "2026-01-14T12:00:00.000Z";
const academicYear = "2025-2026";

async function initialize(store: MemorySyncStore) {
  return applyCommand(store, {
    id: "initialize-year", type: "INITIALIZE_ACADEMIC_YEAR",
    deviceId: "device-a", occurredAt, academicYear,
  });
}

function bookCommand(id = "book-command") {
  return {
    id, type: "UPSERT_BOOK" as const, deviceId: "device-a", occurredAt,
    book: {
      id: "book-1",
      name: "Primary Math",
      educationStage: "primary" as const,
      gradeLevel: "primary1" as const,
    },
  };
}

function studentCommand(id = "student-command") {
  return {
    id, type: "UPSERT_STUDENT" as const, deviceId: "device-a", occurredAt,
    student: {
      id: "student-1", name: "Mona Ahmed", governmentId: "29801011234567",
      educationStage: "primary" as const, gradeLevel: "primary1" as const,
      academicYear, previousStudentId: null,
    },
  };
}

function shipmentCommand(id: string, semester: "first" | "second", quantity: number) {
  return {
    id, type: "ADD_BOOK_STOCK" as const, deviceId: "device-a", occurredAt,
    academicYear, bookId: "book-1", semester, quantity,
    receiptNumber: `receipt-${id}`, receiptDate: "2026-01-14",
  };
}

describe("applyCommand", () => {
  it("rejects a student whose grade does not belong to the supplied stage", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    expect(await applyCommand(store, {
      ...studentCommand(),
      student: {
        ...studentCommand().student,
        educationStage: "primary",
        gradeLevel: "preparatory1",
      },
    })).toMatchObject({ status: "rejected", reasonCode: "VALIDATION_FAILED" });
  });

  it("accepts semester receipt stock and treats the same command as duplicate", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    await applyCommand(store, bookCommand());
    const shipment = shipmentCommand("shipment-1", "second", 4);

    expect(await applyCommand(store, shipment)).toEqual({
      commandId: "shipment-1", status: "accepted",
    });
    expect(store.books.get("book-1")).toMatchObject({
      firstSemesterQuantity: 0,
      secondSemesterQuantity: 4,
    });
    expect(store.transactions.get("shipment-1")).toMatchObject({
      type: "stock_increase", academicYear, receiptNumber: "receipt-shipment-1",
      receiptDate: "2026-01-14",
    });

    expect(await applyCommand(store, shipment)).toEqual({
      commandId: "shipment-1", status: "duplicate",
    });
    expect(store.books.get("book-1")?.secondSemesterQuantity).toBe(4);
  });

  it("rejects an issue when one selected semester has no stock without partial writes", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    await applyCommand(store, bookCommand());
    await applyCommand(store, studentCommand());
    await applyCommand(store, shipmentCommand("shipment-1", "first", 2));

    const result = await applyCommand(store, {
      id: "issue-1", type: "ISSUE_BOOKS_TO_STUDENT", deviceId: "device-a",
      occurredAt, academicYear, studentId: "student-1",
      bookSelections: [
        { bookId: "book-1", semester: "first" },
        { bookId: "book-1", semester: "second" },
      ],
    });

    expect(result).toMatchObject({
      commandId: "issue-1", status: "rejected", reasonCode: "INSUFFICIENT_STOCK",
    });
    expect(store.books.get("book-1")).toMatchObject({
      firstSemesterQuantity: 2,
      secondSemesterQuantity: 0,
    });
    expect(store.transactions.has("issue-1")).toBe(false);
  });

  it("rejects issuing a book to a different grade in the same stage", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    await applyCommand(store, bookCommand());
    await applyCommand(store, {
      ...studentCommand(),
      student: { ...studentCommand().student, gradeLevel: "primary2" },
    });
    await applyCommand(store, shipmentCommand("shipment-1", "first", 2));

    expect(await applyCommand(store, {
      id: "issue-wrong-grade", type: "ISSUE_BOOKS_TO_STUDENT",
      deviceId: "device-a", occurredAt, academicYear, studentId: "student-1",
      bookSelections: [{ bookId: "book-1", semester: "first" }],
    })).toMatchObject({ status: "rejected", reasonCode: "VALIDATION_FAILED" });
    expect(store.books.get("book-1")?.firstSemesterQuantity).toBe(2);
    expect(store.transactions.has("issue-wrong-grade")).toBe(false);
  });

  it("soft deletes a current-year student and records a duplicate-safe tombstone", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    await applyCommand(store, studentCommand());
    const command = {
      id: "delete-student", type: "DELETE_STUDENT" as const,
      deviceId: "device-a", occurredAt, academicYear, studentId: "student-1",
    };

    expect(await applyCommand(store, command)).toEqual({
      commandId: "delete-student", status: "accepted",
    });
    expect(store.students.get("student-1")).toMatchObject({
      deletedAt: occurredAt, updatedAt: occurredAt,
    });
    expect(JSON.parse(store.changes.at(-1)!.payloadJson)).toMatchObject({
      id: "student-1", deletedAt: occurredAt,
    });
    expect(await applyCommand(store, command)).toEqual({
      commandId: "delete-student", status: "duplicate",
    });
  });

  it("soft deletes a book without changing its balances or audit identity", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    await applyCommand(store, bookCommand());
    await applyCommand(store, shipmentCommand("shipment-1", "second", 4));

    expect(await applyCommand(store, {
      id: "delete-book", type: "DELETE_BOOK", deviceId: "device-a",
      occurredAt, bookId: "book-1",
    })).toEqual({ commandId: "delete-book", status: "accepted" });
    expect(store.books.get("book-1")).toMatchObject({
      secondSemesterQuantity: 4, deletedAt: occurredAt, updatedAt: occurredAt,
    });
    expect(JSON.parse(store.changes.at(-1)!.payloadJson)).toMatchObject({
      id: "book-1", name: "Primary Math", deletedAt: occurredAt,
    });
  });

  it("issues both semesters and reverses exact balances once", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    await applyCommand(store, bookCommand());
    await applyCommand(store, studentCommand());
    await applyCommand(store, shipmentCommand("shipment-first", "first", 2));
    await applyCommand(store, shipmentCommand("shipment-second", "second", 3));
    await applyCommand(store, {
      id: "issue-1", type: "ISSUE_BOOKS_TO_STUDENT", deviceId: "device-a",
      occurredAt, academicYear, studentId: "student-1",
      bookSelections: [
        { bookId: "book-1", semester: "first" },
        { bookId: "book-1", semester: "second" },
      ],
    });

    expect(store.books.get("book-1")).toMatchObject({
      firstSemesterQuantity: 1,
      secondSemesterQuantity: 2,
    });
    expect(await applyCommand(store, {
      id: "reverse-1", type: "REVERSE_TRANSACTION", deviceId: "device-a",
      occurredAt, academicYear, transactionId: "issue-1",
    })).toEqual({ commandId: "reverse-1", status: "accepted" });
    expect(store.books.get("book-1")).toMatchObject({
      firstSemesterQuantity: 2,
      secondSemesterQuantity: 3,
    });
    expect([...store.studentBookRows.values()].every(({ reversedAt }) => reversedAt === occurredAt))
      .toBe(true);

    expect(await applyCommand(store, {
      id: "reverse-2", type: "REVERSE_TRANSACTION", deviceId: "device-a",
      occurredAt, academicYear, transactionId: "issue-1",
    })).toMatchObject({ status: "rejected", reasonCode: "TRANSACTION_ALREADY_REVERSED" });
  });

  it("advances the exact year, promotes snapshots, voids final grade, and preserves books", async () => {
    const store = new MemorySyncStore();
    await initialize(store);
    await applyCommand(store, bookCommand());
    await applyCommand(store, studentCommand("primary-student-command"));
    await applyCommand(store, {
      id: "final-student-command", type: "UPSERT_STUDENT", deviceId: "device-a", occurredAt,
      student: {
        id: "final-student", name: "Final Student", governmentId: "final-gov",
        educationStage: "preparatory", gradeLevel: "preparatory3",
        academicYear, previousStudentId: null,
      },
    });
    await applyCommand(store, shipmentCommand("shipment-1", "first", 5));

    const result = await applyCommand(store, {
      id: "advance-1", type: "ADVANCE_ACADEMIC_YEAR", deviceId: "device-a", occurredAt,
      fromYear: academicYear, toYear: "2026-2027",
      promotedStudents: [{
        id: "promoted-primary2", previousStudentId: "student-1", name: "Mona Ahmed",
        governmentId: "29801011234567", educationStage: "primary",
        gradeLevel: "primary2", academicYear: "2026-2027",
      }],
    });

    expect(result).toEqual({ commandId: "advance-1", status: "accepted" });
    expect(store.academicYears.get("2025-2026")?.status).toBe("archived");
    expect(store.academicYears.get("2026-2027")?.status).toBe("current");
    expect(store.students.get("promoted-primary2")).toMatchObject({
      previousStudentId: "student-1", gradeLevel: "primary2",
    });
    expect([...store.students.values()].some(({ previousStudentId }) => previousStudentId === "final-student"))
      .toBe(false);
    expect(store.books.get("book-1")?.firstSemesterQuantity).toBe(5);

    expect(await applyCommand(store, {
      id: "advance-stale", type: "ADVANCE_ACADEMIC_YEAR", deviceId: "device-a", occurredAt,
      fromYear: academicYear, toYear: "2026-2027", promotedStudents: [],
    })).toMatchObject({ status: "rejected", reasonCode: "ACADEMIC_YEAR_MISMATCH" });
  });
});
