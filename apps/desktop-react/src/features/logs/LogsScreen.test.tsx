import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { LogsScreen } from "./LogsScreen";

const now = "2026-07-08T10:00:00.000Z";

describe("LogsScreen", () => {
  it("shows complete transaction detail and confirms reversal", async () => {
    const user = userEvent.setup();
    const backend = createFixtureBackend({
      books: [{ id: "book-1", scopeId: "global", name: "Primary Math", educationStage: "primary", quantity: 2, createdAt: now, updatedAt: now, deletedAt: null }],
      transactions: [{ id: "tx-1", scopeId: "global", type: "stock_increase", studentId: null, reversedTransactionId: null, reversedByTransactionId: null, deviceId: "fixture", commandId: "command-1", occurredAt: now, createdAt: now }],
      items: [{ id: "item-1", transactionId: "tx-1", bookId: "book-1", quantityDelta: 2, quantityAfter: 2, createdAt: now }],
    });
    render(<AppProviders backend={backend}><AppShell><LogsScreen /></AppShell></AppProviders>);
    expect(await screen.findByText("Primary Math")).toBeVisible();
    expect(screen.getByText("+2")).toBeVisible();
    expect(screen.getByText("After: 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reverse transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Reverse transaction?" });
    await user.click(within(dialog).getByRole("button", { name: "Reverse transaction" }));
    expect((await screen.findAllByText("Already reversed"))[0]).toBeVisible();
    expect(await backend.listLogs()).toHaveLength(2);
  });
});
