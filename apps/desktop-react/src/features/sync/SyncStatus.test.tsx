import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { SyncStatus } from "./SyncStatus";

const now = "2026-07-08T10:00:00.000Z";

describe("SyncStatus", () => {
  it("shows and acknowledges a rejected command without deleting it", async () => {
    const user = userEvent.setup();
    const backend = createFixtureBackend({ conflicts: [{
      commandId: "command-1",
      row: { id: "command-1", commandType: "ISSUE_BOOKS_TO_STUDENT", payloadJson: "{}", status: "rejected", attempts: 1, lastError: "INSUFFICIENT_STOCK", createdAt: now, updatedAt: now },
      command: null, isInsufficientStock: true, studentName: "Mona Ahmed", bookNames: ["Primary Math"], acknowledged: false,
    }] });
    backend.syncStore.update({ phase: "rejected", rejectedCount: 1, unacknowledgedRejectedCount: 1 });
    render(<AppProviders backend={backend}><AppShell statusSlot={<SyncStatus />}><div /></AppShell></AppProviders>);
    await user.click(screen.getByRole("button", { name: /Needs review/ }));
    const dialog = screen.getByRole("dialog", { name: "Sync conflicts" });
    expect(within(dialog).getByText("Mona Ahmed")).toBeVisible();
    expect(within(dialog).getByText("Primary Math")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Acknowledge" }));
    expect(await backend.listConflicts()).toEqual([expect.objectContaining({ acknowledged: true })]);
    expect(backend.syncStore.getSnapshot()).toEqual(expect.objectContaining({
      phase: "synced",
      unacknowledgedRejectedCount: 0,
    }));
  });
});
