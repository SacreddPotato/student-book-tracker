import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import type { BookRow } from "../../core/db/repositories/books";
import { BooksScreen } from "./BooksScreen";

const now = "2026-07-08T10:00:00.000Z";
const stocked: BookRow = { id: "book-1", scopeId: "global", name: "Primary Math", educationStage: "primary", quantity: 2, createdAt: now, updatedAt: now, deletedAt: null };
const empty: BookRow = { id: "book-2", scopeId: "global", name: "Primary Science", educationStage: "primary", quantity: 0, createdAt: now, updatedAt: now, deletedAt: null };

function renderBooks(isEmpty = false) {
  const backend = createFixtureBackend(isEmpty ? {} : { books: [stocked, empty] });
  render(<AppProviders backend={backend}><AppShell><BooksScreen /></AppShell></AppProviders>);
  return backend;
}

describe("BooksScreen", () => {
  it("creates a book in a stable editor sheet", async () => {
    const user = userEvent.setup();
    const backend = renderBooks(true);
    await user.click(screen.getByRole("button", { name: "Add book" }));
    const sheet = screen.getByRole("dialog", { name: "Add book" });
    await user.type(within(sheet).getByLabelText("Book name"), "Preparatory Physics");
    await user.click(within(sheet).getByRole("combobox", { name: "Education stage" }));
    await user.click(screen.getByRole("option", { name: "Preparatory" }));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Preparatory Physics")).toBeVisible();
    expect((await backend.listBooks())[0]?.educationStage).toBe("preparatory");
  });

  it("shows zero stock clearly and adds stock only once", async () => {
    const user = userEvent.setup();
    const backend = renderBooks();
    expect(await screen.findByText("Out of stock")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add stock to Primary Science" }));
    const dialog = screen.getByRole("dialog", { name: "Add stock to Primary Science" });
    await user.type(within(dialog).getByLabelText("Quantity"), "3");
    await user.dblClick(within(dialog).getByRole("button", { name: "Add stock" }));
    expect(await screen.findByText("3")).toBeVisible();
    expect((await backend.listBooks()).find(({ id }) => id === "book-2")?.quantity).toBe(3);
  });

  it("filters by name and stage without collapsing the control surface", async () => {
    const user = userEvent.setup();
    renderBooks();
    await screen.findByText("Primary Math");
    await user.type(screen.getByLabelText("Search"), "science");
    expect(screen.queryByText("Primary Math")).not.toBeInTheDocument();
    expect(screen.getByText("Primary Science")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add book" })).toBeVisible();
  });
});
