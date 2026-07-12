import { describe, expect, it } from "vitest";

import { createHealthRoutes } from "../src/routes/health";
import { createSyncRoutes, syncApiTokenHeader } from "../src/routes/sync";
import { MemorySyncStore } from "./memory-sync-store";

const secret = "test-sync-secret";
const occurredAt = "2026-07-09T12:00:00.000Z";

function createRoutes(store = new MemorySyncStore()) {
  return {
    store,
    health: createHealthRoutes(),
    sync: createSyncRoutes({ sharedSecret: secret, store, changeReader: store }),
  };
}

function syncHeaders() {
  return { [syncApiTokenHeader]: secret, "content-type": "application/json" };
}

describe("sync API routes", () => {
  it("reports health without requiring a sync transport token", async () => {
    const { health } = createRoutes();
    const response = await health.request("http://api.test/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "student-book-tracker-sync-api",
    });
  });

  it("protects push and pull with the shared transport token", async () => {
    const { sync } = createRoutes();

    expect((await sync.request("http://api.test/push", { method: "POST" })).status).toBe(401);
    expect((await sync.request("http://api.test/pull?since=0")).status).toBe(401);
  });

  it("pushes commands, returns command results, and pulls their ordered changes", async () => {
    const { sync } = createRoutes();
    const command = {
      id: "book-command",
      type: "UPSERT_BOOK",
      deviceId: "device-a",
      occurredAt,
      book: {
        id: "book-1", name: "Primary Math", educationStage: "primary",
        gradeLevel: "primary1",
      },
    };

    const pushResponse = await sync.request("http://api.test/push", {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({ commands: [command] }),
    });
    expect(pushResponse.status).toBe(200);
    await expect(pushResponse.json()).resolves.toEqual({
      results: [{ commandId: "book-command", status: "accepted" }],
    });

    const duplicateResponse = await sync.request("http://api.test/push", {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({ commands: [command] }),
    });
    await expect(duplicateResponse.json()).resolves.toEqual({
      results: [{ commandId: "book-command", status: "duplicate" }],
    });

    const pullResponse = await sync.request("http://api.test/pull?since=0", {
      headers: syncHeaders(),
    });
    expect(pullResponse.status).toBe(200);
    const pullPayload = (await pullResponse.json()) as {
      changes: Array<{ sequence: number; entityTable: string; entityId: string }>;
      nextCursor: string;
    };
    expect(pullPayload).toMatchObject({
      changes: [{ sequence: 1, entityTable: "books", entityId: "book-1" }],
      nextCursor: "1",
    });
  });

  it("rejects malformed commands and invalid pull cursors", async () => {
    const { sync } = createRoutes();

    expect(
      (
        await sync.request("http://api.test/push", {
          method: "POST",
          headers: syncHeaders(),
          body: JSON.stringify({ commands: [{ type: "ADD_BOOK_STOCK" }] }),
        })
      ).status,
    ).toBe(400);
    expect((await sync.request("http://api.test/push", {
      method: "POST",
      headers: syncHeaders(),
      body: JSON.stringify({ commands: [{
        id: "bad-receipt", type: "ADD_BOOK_STOCK", deviceId: "device-a", occurredAt,
        academicYear: "2025-2026", bookId: "book-1", semester: "first", quantity: 1,
        receiptNumber: "1", receiptDate: "2026-02-31",
      }] }),
    })).status).toBe(400);
    expect(
      (await sync.request("http://api.test/pull?since=not-a-number", { headers: syncHeaders() }))
        .status,
    ).toBe(400);
  });

  it("validates grade-scoped books and accepts student and book tombstones", async () => {
    const { sync, store } = createRoutes();
    const commands = [
      {
        id: "initialize", type: "INITIALIZE_ACADEMIC_YEAR", deviceId: "device-a",
        occurredAt, academicYear: "2025-2026",
      },
      {
        id: "student", type: "UPSERT_STUDENT", deviceId: "device-a", occurredAt,
        student: {
          id: "student-1", name: "Mona", governmentId: "1",
          educationStage: "primary", gradeLevel: "primary1",
          academicYear: "2025-2026", previousStudentId: null,
        },
      },
      {
        id: "book", type: "UPSERT_BOOK", deviceId: "device-a", occurredAt,
        book: {
          id: "book-1", name: "English", educationStage: "primary",
          gradeLevel: "primary1",
        },
      },
      {
        id: "delete-student", type: "DELETE_STUDENT", deviceId: "device-a",
        occurredAt, academicYear: "2025-2026", studentId: "student-1",
      },
      {
        id: "delete-book", type: "DELETE_BOOK", deviceId: "device-a",
        occurredAt, bookId: "book-1",
      },
    ];
    const response = await sync.request("http://api.test/push", {
      method: "POST", headers: syncHeaders(), body: JSON.stringify({ commands }),
    });

    expect(response.status).toBe(200);
    expect(store.students.get("student-1")?.deletedAt).toBe(occurredAt);
    expect(store.books.get("book-1")?.deletedAt).toBe(occurredAt);

    const malformedBook = await sync.request("http://api.test/push", {
      method: "POST", headers: syncHeaders(), body: JSON.stringify({ commands: [{
        id: "bad-book", type: "UPSERT_BOOK", deviceId: "device-a", occurredAt,
        book: { id: "bad", name: "Bad", educationStage: "primary" },
      }] }),
    });
    expect(malformedBook.status).toBe(400);
  });
});
