import { createUpdaterController } from "../updater/updater-controller";
import { createFixtureBackend } from "./fixture-backend";

const now = "2026-07-10T12:00:00.000Z";

export function createBrowserFixtureBackend(scenario: string | null) {
  const backend = createFixtureBackend(scenario === "conflict" ? {
    conflicts: [{
      commandId: "fixture-conflict",
      row: { id: "fixture-conflict", commandType: "ISSUE_BOOKS_TO_STUDENT", payloadJson: "{}", status: "rejected", attempts: 1, lastError: "INSUFFICIENT_STOCK", createdAt: now, updatedAt: now },
      command: null,
      isInsufficientStock: true,
      studentName: "Mona Ahmed",
      bookNames: ["Primary Math"],
      acknowledged: false,
    }],
  } : {});
  if (scenario === "conflict") {
    backend.syncStore.update({ phase: "rejected", rejectedCount: 1, unacknowledgedRejectedCount: 1 });
  }
  if (scenario === "update") {
    backend.updater = createUpdaterController({
      currentVersion: "0.1.0-demo.5",
      enabled: true,
      loadClient: async () => ({
        check: async () => ({
          version: "0.1.0-demo.6",
          download: async () => undefined,
          install: async () => undefined,
        }),
      }),
    });
  }
  return backend;
}
