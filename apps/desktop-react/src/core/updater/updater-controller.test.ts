import { describe, expect, it, vi } from "vitest";

import { createUpdaterController, type AvailableUpdate } from "./updater-controller";

function availableUpdate(): AvailableUpdate {
  return {
    version: "0.2.0",
    download: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
  };
}

describe("updater controller", () => {
  it("stays disabled for the preview profile", async () => {
    const loadClient = vi.fn();
    const controller = createUpdaterController({
      currentVersion: "0.1.0",
      enabled: false,
      loadClient,
    });

    await controller.check();

    expect(controller.store.getSnapshot().phase).toBe("disabled");
    expect(loadClient).not.toHaveBeenCalled();
  });

  it("requires explicit check, download, and install actions", async () => {
    const update = availableUpdate();
    const controller = createUpdaterController({
      currentVersion: "0.1.0",
      enabled: true,
      loadClient: async () => ({ check: async () => update }),
    });

    await controller.check();
    expect(controller.store.getSnapshot()).toEqual(
      expect.objectContaining({ phase: "available", availableVersion: "0.2.0" }),
    );

    await controller.download();
    expect(update.download).toHaveBeenCalledOnce();
    expect(controller.store.getSnapshot().phase).toBe("ready");

    await controller.install();
    expect(update.install).toHaveBeenCalledOnce();
    expect(controller.store.getSnapshot().phase).toBe("installing");
  });

  it("retains an actionable failure", async () => {
    const controller = createUpdaterController({
      currentVersion: "0.1.0",
      enabled: true,
      loadClient: async () => ({
        check: async () => { throw new Error("Feed unavailable"); },
      }),
    });

    await controller.check();

    expect(controller.store.getSnapshot()).toEqual(
      expect.objectContaining({ phase: "failed", error: "Feed unavailable" }),
    );
  });
});
