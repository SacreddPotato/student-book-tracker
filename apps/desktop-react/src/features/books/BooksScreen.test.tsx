import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import type { BookRow } from "../../core/db/repositories/books";
import { BooksScreen } from "./BooksScreen";

const exportMocks = vi.hoisted(() => ({
  workbook: { kind: "book-workbook" },
  buildBooksWorkbook: vi.fn(),
  downloadBooksWorkbook: vi.fn(),
}));

vi.mock("../../core/export/excel-export", () => ({
  buildBooksWorkbook: exportMocks.buildBooksWorkbook,
  downloadBooksWorkbook: exportMocks.downloadBooksWorkbook,
}));

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
  beforeEach(() => {
    exportMocks.buildBooksWorkbook.mockReset();
    exportMocks.buildBooksWorkbook.mockReturnValue(exportMocks.workbook);
    exportMocks.downloadBooksWorkbook.mockReset();
    exportMocks.downloadBooksWorkbook.mockResolvedValue(undefined);
  });

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

  it("deletes a subject only after the exact password", async () => {
    const user = userEvent.setup();
    const backend = renderBooks();
    await user.click(await screen.findByRole("button", { name: "Delete book Primary Math" }));
    const dialog = screen.getByRole("dialog", { name: "Delete book" });
    expect(within(dialog).getByText(/Primary Math/)).toBeVisible();

    const password = within(dialog).getByLabelText("Password");
    await user.type(password, "wrong");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(within(dialog).getByText("Incorrect password.")).toBeVisible();
    expect(await backend.listBooks()).toHaveLength(2);

    await user.clear(password);
    await user.type(password, "az2006");
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

  it("exports a resettable grade-specific current-year audit exactly once", async () => {
    const user = userEvent.setup();
    const primary2Math: BookRow = { ...stocked, id: "book-math-primary2", gradeLevel: "primary2" };
    const primary3Math: BookRow = { ...stocked, id: "book-math-primary3", gradeLevel: "primary3" };
    const backend = createFixtureBackend({
      academicYears: [year],
      books: [stocked, primary2Math, primary3Math, empty],
      transactions: [{
        id: "stock-export", scopeId: "global", academicYear: year.academicYear,
        type: "stock_increase", studentId: null, receiptNumber: "R-41",
        receiptDate: "2026-01-14", reversedTransactionId: null,
        reversedByTransactionId: null, deviceId: "fixture", commandId: "command-export",
        occurredAt: "2026-01-14T10:00:00.000Z", createdAt: "2026-01-14T10:00:00.000Z",
      }],
      items: [{
        id: "item-export", transactionId: "stock-export", bookId: stocked.id,
        semester: "first", quantityDelta: 25, quantityAfter: 25,
        createdAt: "2026-01-14T10:00:00.000Z",
      }],
    });
    const listLogs = vi.spyOn(backend, "listLogs");
    renderBooksWithBackend(backend);

    await user.click(await screen.findByRole("button", { name: "Export inventory" }));
    let dialog = screen.getByRole("dialog", { name: "Export book inventory audit" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(4);
    expect(within(dialog).getByRole("checkbox", { name: "Primary Math — 1st Primary" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Primary Math — 2nd Primary" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Primary Math — 3rd Primary" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Primary Science — 1st Primary" })).toBeChecked();

    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Science — 1st Primary" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Math — 2nd Primary" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Math — 3rd Primary" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Math — 1st Primary" }));
    expect(within(dialog).getByRole("button", { name: "Export inventory" })).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Math — 1st Primary" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Export inventory" }));
    dialog = screen.getByRole("dialog", { name: "Export book inventory audit" });
    expect(within(dialog).getByRole("checkbox", { name: "Primary Science — 1st Primary" })).toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Science — 1st Primary" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Math — 2nd Primary" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Math — 3rd Primary" }));
    await user.dblClick(within(dialog).getByRole("button", { name: "Export inventory" }));

    await waitFor(() => expect(exportMocks.downloadBooksWorkbook).toHaveBeenCalledTimes(1));
    expect(listLogs).toHaveBeenCalledWith("2025-2026");
    expect(exportMocks.buildBooksWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      books: expect.arrayContaining([
        expect.objectContaining({ id: "book-1", gradeLevel: "primary1" }),
        expect.objectContaining({ id: "book-math-primary2", gradeLevel: "primary2" }),
        expect.objectContaining({ id: "book-math-primary3", gradeLevel: "primary3" }),
      ]),
      academicYear: year,
      selectedBookIds: ["book-1"],
      language: "en",
      logs: expect.arrayContaining([expect.objectContaining({ id: "stock-export" })]),
    }));
    expect(exportMocks.downloadBooksWorkbook).toHaveBeenCalledWith(
      exportMocks.workbook,
      "book-inventory-audit-2025-2026.xlsx",
    );
    expect(screen.queryByRole("dialog", { name: "Export book inventory audit" })).not.toBeInTheDocument();
    expect(await screen.findByText("Export created.")).toBeVisible();
  });

  it("retains the subject selection and shows an error when export fails", async () => {
    const user = userEvent.setup();
    exportMocks.downloadBooksWorkbook.mockRejectedValueOnce(new Error("write failed"));
    renderBooks();

    await user.click(await screen.findByRole("button", { name: "Export inventory" }));
    const dialog = screen.getByRole("dialog", { name: "Export book inventory audit" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Primary Science — 1st Primary" }));
    await user.click(within(dialog).getByRole("button", { name: "Export inventory" }));

    expect(await within(dialog).findByText("Could not create the export.")).toBeVisible();
    expect(within(dialog).getByRole("checkbox", { name: "Primary Math — 1st Primary" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Primary Science — 1st Primary" })).not.toBeChecked();
  });
});
