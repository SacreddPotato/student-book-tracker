import { describe, expect, it } from "vitest";

import { CoalescingSyncRunner } from "./sync-runner";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("CoalescingSyncRunner", () => {
  it("runs one follow-up sync when requests arrive during an active sync", async () => {
    const firstRunStarted = deferred();
    const allowFirstRun = deferred();
    let runs = 0;
    const runner = new CoalescingSyncRunner(async () => {
      runs += 1;
      if (runs === 1) {
        firstRunStarted.resolve();
        await allowFirstRun.promise;
      }
    });

    const first = runner.request();
    await firstRunStarted.promise;
    const second = runner.request();
    allowFirstRun.resolve();

    await Promise.all([first, second]);
    expect(runs).toBe(2);
  });
});
