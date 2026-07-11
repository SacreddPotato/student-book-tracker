import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { createUpdaterController } from "../../core/updater/updater-controller";
import { UpdateNotice } from "./UpdateNotice";

describe("UpdateNotice", () => {
  it("checks availability and dismisses only the available version", async () => {
    const user = userEvent.setup();
    const backend = createFixtureBackend();
    backend.updater = createUpdaterController({ currentVersion: "0.1.0", enabled: true, loadClient: async () => ({ check: async () => ({ version: "0.2.0", download: async () => undefined, install: async () => undefined }) }) });
    render(<AppProviders backend={backend} initialLanguage="en"><UpdateNotice /></AppProviders>);
    expect(await screen.findByLabelText("Update available")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByLabelText("Update available")).not.toBeInTheDocument();
  });
});
