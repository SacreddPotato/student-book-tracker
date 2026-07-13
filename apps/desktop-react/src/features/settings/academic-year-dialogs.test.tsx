import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { SettingsScreen } from "./SettingsScreen";

const now = "2026-07-08T10:00:00.000Z";

describe("academic year dialogs", () => {
  it.each(["synced", "rejected", "offline", "error"] as const)(
    "waits for the initial sync before prompting when it ends as %s",
    async (phase) => {
      const backend = createFixtureBackend();
      backend.syncStore.update({ phase: "idle" });
      const listAcademicYears = vi.spyOn(backend, "listAcademicYears");
      render(<AppProviders backend={backend} initialLanguage="en"><AppShell><div>Workspace</div></AppShell></AppProviders>);

      await waitFor(() => expect(listAcademicYears).toHaveBeenCalled());
      expect(screen.queryByRole("dialog", { name: "Set academic year" })).not.toBeInTheDocument();
      act(() => backend.syncStore.update({ phase: "syncing" }));
      expect(screen.queryByRole("dialog", { name: "Set academic year" })).not.toBeInTheDocument();

      act(() => backend.syncStore.update({ phase }));
      expect(await screen.findByRole("dialog", { name: "Set academic year" })).toBeVisible();
    },
  );

  it("adopts a year pulled during initial sync without prompting", async () => {
    const backend = createFixtureBackend();
    backend.syncStore.update({ phase: "idle" });
    const listAcademicYears = vi.spyOn(backend, "listAcademicYears");
    render(<AppProviders backend={backend} initialLanguage="en"><AppShell><div>Workspace</div></AppShell></AppProviders>);

    await waitFor(() => expect(listAcademicYears).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Set academic year" })).not.toBeInTheDocument();
    act(() => backend.syncStore.update({ phase: "syncing" }));
    await backend.initializeAcademicYear("2025-2026");
    act(() => backend.syncStore.update({ phase: "synced" }));

    await waitFor(() => expect(listAcademicYears.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByRole("dialog", { name: "Set academic year" })).not.toBeInTheDocument();
  });

  it("does not block an existing local academic year while sync is pending", async () => {
    const backend = createFixtureBackend({ academicYears: [
      { academicYear: "2025-2026", status: "current", createdAt: now, archivedAt: null },
    ] });
    backend.syncStore.update({ phase: "idle" });
    const listAcademicYears = vi.spyOn(backend, "listAcademicYears");
    render(<AppProviders backend={backend} initialLanguage="en"><AppShell><div>Workspace</div></AppShell></AppProviders>);

    await waitFor(() => expect(listAcademicYears).toHaveBeenCalled());
    act(() => backend.syncStore.update({ phase: "syncing" }));

    expect(screen.queryByRole("dialog", { name: "Set academic year" })).not.toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeVisible();
  });

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
