// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { get } from "svelte/store";
import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { language } from "$lib/i18n";
import { initialUpdaterState, resetUpdaterState, updaterStatus } from "$lib/services/updater";
import { requestedAppScreen } from "$lib/ui/app-navigation";

import UpdateAvailableToast from "./UpdateAvailableToast.svelte";

function showAvailableUpdate(version: string): void {
  updaterStatus.set({
    ...initialUpdaterState,
    phase: "available",
    availableVersion: version,
  });
}

describe("UpdateAvailableToast", () => {
  beforeEach(() => {
    language.set("en");
    resetUpdaterState();
    requestedAppScreen.set(null);
  });

  it("announces an available update from the global updater state", () => {
    showAvailableUpdate("0.1.0-demo.3");
    render(UpdateAvailableToast);

    expect(screen.getByRole("status", { name: "Update available" })).toBeInTheDocument();
    expect(screen.getByText("Version 0.1.0-demo.3 is available.")).toBeInTheDocument();
  });

  it("opens Settings and dismisses the current update notification", async () => {
    const user = userEvent.setup();
    showAvailableUpdate("0.1.0-demo.3");
    render(UpdateAvailableToast);

    await user.click(screen.getByRole("button", { name: "View update" }));

    expect(get(requestedAppScreen)).toBe("settings");
    expect(screen.queryByRole("status", { name: "Update available" })).not.toBeInTheDocument();
  });

  it("can be dismissed and returns for a different available version", async () => {
    const user = userEvent.setup();
    showAvailableUpdate("0.1.0-demo.3");
    render(UpdateAvailableToast);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status", { name: "Update available" })).not.toBeInTheDocument();

    showAvailableUpdate("0.1.0-demo.4");
    await waitFor(() =>
      expect(screen.getByText("Version 0.1.0-demo.4 is available.")).toBeInTheDocument(),
    );
  });
});
