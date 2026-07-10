import { describe, expect, it, vi } from "vitest";

import { createExternalStore } from "./external-store";

describe("createExternalStore", () => {
  it("updates snapshots and notifies subscribers", () => {
    const store = createExternalStore({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update({ count: 1 });
    store.update((current) => ({ count: current.count + 1 }));
    unsubscribe();
    store.update({ count: 3 });

    expect(store.getSnapshot()).toEqual({ count: 3 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
