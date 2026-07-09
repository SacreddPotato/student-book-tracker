import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkForUpdates,
  downloadAvailableUpdate,
  initialUpdaterState,
  installAvailableUpdate,
  resetUpdaterState,
  updaterStatus,
  type AvailableUpdate,
  type UpdaterClient,
} from "./updater";

function createUpdate(version = "0.1.0-demo.2"): AvailableUpdate {
  return {
    version,
    download: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
  };
}

describe("desktop updater", () => {
  beforeEach(() => {
    resetUpdaterState();
  });

  it("keeps updater checks disabled outside an installed production app", async () => {
    await checkForUpdates({ enabled: false });

    expect(get(updaterStatus)).toEqual({ ...initialUpdaterState, phase: "disabled" });
  });

  it("finds, downloads, and leaves an update ready for explicit installation", async () => {
    const update = createUpdate();
    const client: UpdaterClient = { check: vi.fn(async () => update) };

    await checkForUpdates({ client, enabled: true });
    expect(get(updaterStatus)).toMatchObject({
      phase: "available",
      availableVersion: "0.1.0-demo.2",
    });

    await downloadAvailableUpdate();
    expect(update.download).toHaveBeenCalledOnce();
    expect(get(updaterStatus).phase).toBe("ready");

    await installAvailableUpdate();
    expect(update.install).toHaveBeenCalledOnce();
    expect(get(updaterStatus).phase).toBe("installing");
  });

  it("shows an up-to-date state when the feed has no newer release", async () => {
    await checkForUpdates({ client: { check: vi.fn(async () => null) }, enabled: true });

    expect(get(updaterStatus)).toMatchObject({ phase: "upToDate", availableVersion: null });
  });

  it("retains an actionable failure state", async () => {
    await checkForUpdates({
      client: { check: vi.fn(async () => Promise.reject(new Error("feed unavailable"))) },
      enabled: true,
    });

    expect(get(updaterStatus)).toMatchObject({ phase: "failed", error: "feed unavailable" });
  });
});
