import { describe, expect, it } from "vitest";

import { createTestDatabase } from "../db/test-database";
import { countOutboxRowsByStatus } from "../db/repositories/outbox";
import { createUpdaterController } from "../updater/updater-controller";
import { createDatabaseBackend } from "./tauri-backend";

describe("database backend", () => {
  it("composes persisted workflows, log projections, and explicit sync", async () => {
    const database = createTestDatabase();
    const ids = [
      "student-1", "student-command", "book-1", "book-command",
      "stock-command", "stock-transaction", "stock-item",
      "issue-command", "issue-transaction", "issue-item", "student-book-1",
    ];
    const backend = createDatabaseBackend({
      database,
      client: {
        push: async (commands) => commands.map(({ id }) => ({
          commandId: id, status: "accepted" as const,
        })),
        pull: async () => ({ changes: [], nextCursor: "0" }),
      },
      updater: createUpdaterController({
        currentVersion: "0.1.0", enabled: false,
        loadClient: async () => ({ check: async () => null }),
      }),
      autoSync: false,
      now: () => "2026-07-08T10:00:00.000Z",
      createId: () => ids.shift() ?? (() => { throw new Error("Missing test ID"); })(),
    });

    await backend.initialize();
    const student = await backend.saveStudent({
      name: "Mona Ahmed", governmentId: "29801011234567",
      educationStage: "primary", gradeLevel: "primary1",
    });
    const book = await backend.saveBook({ name: "Primary Math", educationStage: "primary" });
    await backend.addStock({ bookId: book.id, quantity: 2 });
    await backend.issueBooks({ studentId: student.id, bookIds: [book.id] });

    expect(await backend.listLogs()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "student_issue", studentName: "Mona Ahmed" }),
      expect.objectContaining({
        type: "stock_increase",
        items: [expect.objectContaining({ bookName: "Primary Math" })],
      }),
    ]));
    expect(await countOutboxRowsByStatus(database, "pending")).toBe(4);

    await backend.requestSync();

    expect(await countOutboxRowsByStatus(database, "synced")).toBe(4);
    expect(backend.syncStore.getSnapshot().phase).toBe("synced");
    database.close();
  });
});
