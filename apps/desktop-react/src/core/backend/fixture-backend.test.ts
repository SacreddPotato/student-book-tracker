import { describe, expect, it } from "vitest";

import { createFixtureBackend } from "./fixture-backend";

describe("fixture backend", () => {
  it("supports the complete local inventory lifecycle", async () => {
    const backend = createFixtureBackend();
    await backend.initialize();
    const student = await backend.saveStudent({
      name: "Mona Ahmed", governmentId: "29801011234567",
      educationStage: "primary", gradeLevel: "primary1",
    });
    const book = await backend.saveBook({
      name: "Primary Math", educationStage: "primary",
    });
    await backend.addStock({ bookId: book.id, quantity: 2 });
    await backend.issueBooks({ studentId: student.id, bookIds: [book.id] });

    expect(await backend.listBooks()).toEqual([
      expect.objectContaining({ id: book.id, quantity: 1 }),
    ]);
    expect(await backend.listIssuedBooks(student.id)).toHaveLength(1);
    const issue = (await backend.listLogs()).find(({ type }) => type === "student_issue")!;

    await backend.reverseTransaction(issue.id);

    expect((await backend.listBooks())[0]?.quantity).toBe(2);
    expect(await backend.listIssuedBooks(student.id)).toEqual([]);
    expect((await backend.listLogs()).filter(({ type }) => type === "reversal")).toHaveLength(1);
  });

  it("keeps preview updater disabled and exposes sync status", async () => {
    const backend = createFixtureBackend();
    await backend.updater.check();

    expect(backend.updater.store.getSnapshot().phase).toBe("disabled");
    expect(backend.syncStore.getSnapshot().phase).toBe("synced");
  });
});
