import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { SettingsScreen } from "./SettingsScreen";

const now = "2026-07-08T10:00:00.000Z";

describe("academic year dialogs", () => {
  it("blocks first use until a valid academic year is initialized", async () => {
    const user = userEvent.setup();
    const backend = createFixtureBackend();
    render(<AppProviders backend={backend} initialLanguage="en"><AppShell><div>Workspace</div></AppShell></AppProviders>);
    const dialog = await screen.findByRole("dialog", { name: "Set academic year" });
    await user.type(within(dialog).getByLabelText("Academic year"), "2025-2026");
    await user.click(within(dialog).getByRole("button", { name: "Start academic year" }));
    expect(await backend.listAcademicYears()).toEqual([
      expect.objectContaining({ academicYear: "2025-2026", status: "current" }),
    ]);
  });

  it("requires typing the exact successor before advancing", async () => {
    const user = userEvent.setup();
    const backend = createFixtureBackend({ academicYears: [
      { academicYear: "2025-2026", status: "current", createdAt: now, archivedAt: null },
    ] });
    render(<AppProviders backend={backend} initialLanguage="en"><AppShell><SettingsScreen /></AppShell></AppProviders>);
    await user.click(await screen.findByRole("button", { name: "Advance to 2026-2027" }));
    const dialog = screen.getByRole("dialog", { name: "Advance academic year?" });
    const confirm = within(dialog).getByRole("button", { name: "Advance academic year" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type 2026-2027 to confirm"), "2026-2027");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await backend.listAcademicYears()).toEqual(expect.arrayContaining([
      expect.objectContaining({ academicYear: "2026-2027", status: "current" }),
      expect.objectContaining({ academicYear: "2025-2026", status: "archived" }),
    ]));
  });
});
