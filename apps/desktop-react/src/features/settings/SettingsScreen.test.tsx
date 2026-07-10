import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { createUpdaterController } from "../../core/updater/updater-controller";
import { SettingsScreen } from "./SettingsScreen";

describe("SettingsScreen", () => {
  it("requires explicit check, download, and install actions", async () => {
    const user = userEvent.setup();
    const download = vi.fn(async () => undefined);
    const install = vi.fn(async () => undefined);
    const backend = createFixtureBackend();
    backend.updater = createUpdaterController({
      currentVersion: "0.1.0",
      enabled: true,
      loadClient: async () => ({ check: async () => ({ version: "0.2.0", download, install }) }),
    });
    render(<AppProviders backend={backend}><AppShell><SettingsScreen /></AppShell></AppProviders>);
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Version 0.2.0 is available.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Download update" }));
    expect(await screen.findByText("The update is ready to install.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Install update" }));
    expect(install).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledOnce();
  });
});
