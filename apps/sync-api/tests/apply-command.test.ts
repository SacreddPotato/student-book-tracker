import { describe, expect, it } from "vitest";

import { applyCommand } from "../src/services/apply-command";
import { MemorySyncStore } from "./memory-sync-store";

const occurredAt = "2026-07-09T12:00:00.000Z";

function bookCommand(id = "book-command") {
  return {
    id,
    type: "UPSERT_BOOK" as const,
    deviceId: "device-a",
    occurredAt,
    book: { id: "book-1", name: "Primary Math", educationStage: "primary" as const },
  };
}

function studentCommand(id = "student-command") {
  return {
    id,
    type: "UPSERT_STUDENT" as const,
    deviceId: "device-a",
    occurredAt,
    student: {
      id: "student-1",
      name: "Mona Ahmed",
      governmentId: "29801011234567",
      educationStage: "primary" as const,
      gradeLevel: "primary1" as const,
    },
  };
}

describe("applyCommand", () => {
  it("accepts a shipment increase and treats the same command as a duplicate", async () => {
    const store = new MemorySyncStore();
    await applyCommand(store, bookCommand());

    const shipment = {
      id: "shipment-1",
      type: "ADD_BOOK_STOCK" as const,
      deviceId: "device-a",
      occurredAt,
      bookId: "book-1",
      quantity: 4,
    };

    expect(await applyCommand(store, shipment)).toEqual({
      commandId: "shipment-1",
      status: "accepted",
    });
    expect(store.books.get("book-1")?.quantity).toBe(4);
    expect(store.transactions.get("shipment-1")).toMatchObject({ type: "stock_increase" });

    expect(await applyCommand(store, shipment)).toEqual({
      commandId: "shipment-1",
      status: "duplicate",
    });
    expect(store.books.get("book-1")?.quantity).toBe(4);
  });

  it("rejects an issue when any book has insufficient stock without partial writes", async () => {
    const store = new MemorySyncStore();
    await applyCommand(store, bookCommand());
    await applyCommand(store, studentCommand());

    const result = await applyCommand(store, {
      id: "issue-1",
      type: "ISSUE_BOOKS_TO_STUDENT",
      deviceId: "device-a",
      occurredAt,
      studentId: "student-1",
      bookIds: ["book-1"],
    });

    expect(result).toMatchObject({
      commandId: "issue-1",
      status: "rejected",
      reasonCode: "INSUFFICIENT_STOCK",
    });
    expect(store.books.get("book-1")?.quantity).toBe(0);
    expect(store.transactions.has("issue-1")).toBe(false);
  });

  it("issues a book and reverses it exactly once", async () => {
    const store = new MemorySyncStore();
    await applyCommand(store, bookCommand());
    await applyCommand(store, studentCommand());
    await applyCommand(store, {
      id: "shipment-1",
      type: "ADD_BOOK_STOCK",
      deviceId: "device-a",
      occurredAt,
      bookId: "book-1",
      quantity: 2,
    });
    await applyCommand(store, {
      id: "issue-1",
      type: "ISSUE_BOOKS_TO_STUDENT",
      deviceId: "device-a",
      occurredAt,
      studentId: "student-1",
      bookIds: ["book-1"],
    });

    expect(store.books.get("book-1")?.quantity).toBe(1);
    expect(
      await applyCommand(store, {
        id: "reverse-1",
        type: "REVERSE_TRANSACTION",
        deviceId: "device-a",
        occurredAt,
        transactionId: "issue-1",
      }),
    ).toEqual({ commandId: "reverse-1", status: "accepted" });
    expect(store.books.get("book-1")?.quantity).toBe(2);
    expect(store.transactions.get("issue-1")?.reversedByTransactionId).toBe("reverse-1");
    expect([...store.studentBookRows.values()][0]?.reversedAt).toBe(occurredAt);

    expect(
      await applyCommand(store, {
        id: "reverse-2",
        type: "REVERSE_TRANSACTION",
        deviceId: "device-a",
        occurredAt,
        transactionId: "issue-1",
      }),
    ).toMatchObject({ status: "rejected", reasonCode: "TRANSACTION_ALREADY_REVERSED" });
  });
});
