import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import type { BookRow } from "../../core/db/repositories/books";
import { BooksScreen } from "./BooksScreen";

const now = "2026-07-08T10:00:00.000Z";
const year = { academicYear: "2025-2026", status: "current" as const, createdAt: now, archivedAt: null };
const stocked: BookRow = { id: "book-1", scopeId: "global", name: "Primary Math", educationStage: "primary", gradeLevel: "primary1", firstSemesterQuantity: 2, secondSemesterQuantity: 1, createdAt: now, updatedAt: now, deletedAt: null };
const empty: BookRow = { id: "book-2", scopeId: "global", name: "Primary Science", educationStage: "primary", gradeLevel: "primary1", firstSemesterQuantity: 0, secondSemesterQuantity: 0, createdAt: now, updatedAt: now, deletedAt: null };

function renderBooks(isEmpty = false) {
  const backend = createFixtureBackend({ academicYears: [year], ...(isEmpty ? {} : { books: [stocked, empty] }) });
  return renderBooksWithBackend(backend);
}

function renderBooksWithBackend(backend: ReturnType<typeof createFixtureBackend>) {
  render(<AppProviders backend={backend} initialLanguage="en"><AppShell><BooksScreen /></AppShell></AppProviders>);
  return backend;
}

describe("BooksScreen", () => {
  it("creates independent books for every selected grade", async () => {
    const user = userEvent.setup();
    const backend = renderBooks(true);
    await user.click(screen.getByRole("button", { name: "Add book" }));
    const sheet = screen.getByRole("dialog", { name: "Add book" });
    await user.type(within(sheet).getByLabelText("Book name"), "Preparatory Physics");
    await user.click(within(sheet).getByRole("combobox", { name: "Education stage" }));
    await user.click(screen.getByRole("option", { name: "Preparatory" }));
    await user.click(within(sheet).getByRole("checkbox", { name: "2nd Preparatory" }));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect((await screen.findAllByText("Preparatory Physics"))).toHaveLength(2);
    expect((await backend.listBooks()).map(({ gradeLevel }) => gradeLevel)).toEqual([
      "preparatory1", "preparatory2",
    ]);
  }, 10_000);

  it("deletes a subject only after destructive confirmation", async () => {
    const user = userEvent.setup();
    const backend = renderBooks();
    await user.click(await screen.findByRole("button", { name: "Delete book Primary Math" }));
    const dialog = screen.getByRole("dialog", { name: "Delete book" });
    expect(within(dialog).getByText(/Primary Math/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(screen.queryByText("Primary Math")).not.toBeInTheDocument();
    expect((await backend.listBooks()).map(({ id }) => id)).toEqual(["book-2"]);
  });

  it("shows zero stock clearly and adds stock only once", async () => {
    const user = userEvent.setup();
    const backend = renderBooks();
    expect((await screen.findAllByText("Out of stock"))[0]).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add second semester stock to Primary Science" }));
    const dialog = screen.getByRole("dialog", { name: "Add second semester stock to Primary Science" });
    await user.type(within(dialog).getByLabelText("Quantity"), "3");
    await user.type(within(dialog).getByLabelText("Issue receipt number"), "00041");
    await user.type(within(dialog).getByLabelText("Issue receipt date"), "2026-01-14");
    await user.dblClick(within(dialog).getByRole("button", { name: "Add stock" }));
    expect(await screen.findByText("3")).toBeVisible();
    expect((await backend.listBooks()).find(({ id }) => id === "book-2")?.secondSemesterQuantity).toBe(3);
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

  it("expands the entire subject row into a cross-year receipt and issuance audit", async () => {
    const user = userEvent.setup();
    renderBooksWithBackend(createFixtureBackend({
      academicYears: [
        year,
        { academicYear: "2024-2025", status: "archived", createdAt: now, archivedAt: now },
      ],
      books: [stocked],
      students: [{
        id: "student-1", scopeId: "global", name: "Mona Ahmed", governmentId: "1",
        educationStage: "primary", gradeLevel: "primary1", academicYear: "2025-2026",
        previousStudentId: null, createdAt: now, updatedAt: now, deletedAt: null,
      }],
      transactions: [
        {
          id: "issue-1", scopeId: "global", academicYear: "2025-2026",
          type: "student_issue", studentId: "student-1", receiptNumber: null,
          receiptDate: null, reversedTransactionId: null, reversedByTransactionId: null,
          deviceId: "fixture", commandId: "issue-command", occurredAt: "2026-01-15T10:00:00.000Z", createdAt: "2026-01-15T10:00:00.000Z",
        },
        {
          id: "stock-1", scopeId: "global", academicYear: "2024-2025",
          type: "stock_increase", studentId: null, receiptNumber: "R-41",
          receiptDate: "2025-01-14", reversedTransactionId: null, reversedByTransactionId: null,
          deviceId: "fixture", commandId: "stock-command", occurredAt: "2025-01-14T10:00:00.000Z", createdAt: "2025-01-14T10:00:00.000Z",
        },
      ],
      items: [
        { id: "issue-item", transactionId: "issue-1", bookId: "book-1", semester: "second", quantityDelta: -1, quantityAfter: 1, createdAt: "2026-01-15T10:00:00.000Z" },
        { id: "stock-item", transactionId: "stock-1", bookId: "book-1", semester: "first", quantityDelta: 3, quantityAfter: 3, createdAt: "2025-01-14T10:00:00.000Z" },
      ],
    }));
    const row = await screen.findByRole("row", { name: /Primary Math/ });
    const disclosure = within(row).getByRole("button", { name: "Expand history for Primary Math" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    await user.click(row);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("2025-2026")).toBeVisible();
    expect(screen.getByText("2024-2025")).toBeVisible();
    expect(screen.getByText(/Mona Ahmed/)).toBeVisible();
    expect(screen.getByText(/R-41/)).toBeVisible();
    expect(screen.getByText("2025-01-14")).toBeVisible();

    await user.click(row);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Mona Ahmed")).not.toBeInTheDocument();
  });

  it("uses plus icons for semester stock actions without toggling history", async () => {
    const user = userEvent.setup();
    renderBooks();
    const row = await screen.findByRole("row", { name: /Primary Math/ });
    const action = within(row).getByRole("button", { name: "Add first semester stock to Primary Math" });
    const disclosure = within(row).getByRole("button", { name: "Expand history for Primary Math" });
    expect(action.querySelector(".lucide-plus")).not.toBeNull();

    await user.click(action);

    expect(screen.getByRole("dialog", { name: "Add first semester stock to Primary Math" })).toBeVisible();
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
  });
});
