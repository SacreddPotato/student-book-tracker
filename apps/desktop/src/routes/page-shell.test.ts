// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTranslation, language } from "$lib/i18n";
import { desktopVersion } from "$lib/services/updater";
import { requestAppScreen, requestedAppScreen } from "$lib/ui/app-navigation";
import Page from "./+page.svelte";

vi.mock("$lib/db/local-db", () => ({
  initializeLocalDatabase: vi.fn(async () => ({
    execute: vi.fn(async () => undefined),
    select: vi.fn(async () => []),
  })),
}));

describe("app shell", () => {
  beforeEach(() => {
    language.set("en");
    requestedAppScreen.set(null);
  });

  it("keeps the main Tauri window on native decorations", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    ) as { app: { windows: Array<{ decorations?: boolean }> } };

    expect(config.app.windows[0]?.decorations).not.toBe(false);
  });

  it("uses a compact EN/AR language toggle without offline status copy", async () => {
    const user = userEvent.setup();
    render(Page);

    expect(screen.queryByText("Offline ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Offline desktop workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Language" })).not.toBeInTheDocument();

    const englishButton = screen.getByRole("button", { name: "EN" });
    const arabicButton = screen.getByRole("button", { name: "AR" });

    expect(englishButton).toHaveAttribute("aria-pressed", "true");
    expect(arabicButton).toHaveAttribute("aria-pressed", "false");

    await user.click(arabicButton);

    expect(arabicButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: getTranslation("ar", "tabs.students") })).toBeInTheDocument();

    await user.click(englishButton);

    expect(englishButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Students" })).toBeInTheDocument();
  });

  it("does not render custom window action buttons", () => {
    render(Page);

    expect(screen.queryByRole("button", { name: "Minimize window" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Maximize window" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close window" })).not.toBeInTheDocument();
  });

  it("keeps updater actions in the Settings screen instead of the primary workflow", async () => {
    const user = userEvent.setup();
    render(Page);

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "App updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
    expect(screen.getByText(`Version ${desktopVersion}`)).toBeInTheDocument();
  });

  it("accepts a global request to open Settings from an update notification", async () => {
    render(Page);

    requestAppScreen("settings");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument(),
    );
  });
});
