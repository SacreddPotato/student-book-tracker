// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTranslation, language } from "$lib/i18n";
import Page from "./+page.svelte";

const windowControls = vi.hoisted(() => ({
  minimize: vi.fn(async () => undefined),
  toggleMaximize: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
}));

vi.mock("$lib/db/local-db", () => ({
  initializeLocalDatabase: vi.fn(async () => ({
    execute: vi.fn(async () => undefined),
    select: vi.fn(async () => []),
  })),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowControls,
}));

describe("app shell", () => {
  beforeEach(() => {
    language.set("en");
    windowControls.minimize.mockClear();
    windowControls.toggleMaximize.mockClear();
    windowControls.close.mockClear();
  });

  it("configures the main Tauri window without native decorations", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    ) as { app: { windows: Array<{ decorations?: boolean }> } };

    expect(config.app.windows[0]?.decorations).toBe(false);
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

  it("renders custom window action buttons wired to the Tauri window API", async () => {
    const user = userEvent.setup();
    render(Page);

    await user.click(screen.getByRole("button", { name: "Minimize window" }));
    await user.click(screen.getByRole("button", { name: "Maximize window" }));
    await user.click(screen.getByRole("button", { name: "Close window" }));

    expect(windowControls.minimize).toHaveBeenCalledTimes(1);
    expect(windowControls.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(windowControls.close).toHaveBeenCalledTimes(1);
  });
});
