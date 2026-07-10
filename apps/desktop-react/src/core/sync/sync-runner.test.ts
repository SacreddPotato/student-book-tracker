import { describe, expect, it, vi } from "vitest";

import { CoalescingSyncRunner } from "./sync-runner";

describe("CoalescingSyncRunner", () => {
  it("coalesces bursts into one active run and one final run", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const run = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const runner = new CoalescingSyncRunner(run);

    const pending = runner.request();
    void runner.request();
    void runner.request();
    release();
    await pending;

    expect(run).toHaveBeenCalledTimes(2);
  });
});
