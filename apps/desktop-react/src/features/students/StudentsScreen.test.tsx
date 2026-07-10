import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { AppShell } from "../../components/shell/AppShell";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import type { BookRow } from "../../core/db/repositories/books";
import type { StudentRow } from "../../core/db/repositories/students";
import { StudentsScreen } from "./StudentsScreen";

const now = "2026-07-08T10:00:00.000Z";
const student: StudentRow = {
  id: "student-1", scopeId: "global", name: "Mona Ahmed",
  governmentId: "29801011234567", educationStage: "primary",
  gradeLevel: "primary1", createdAt: now, updatedAt: now, deletedAt: null,
};
const availableBook: BookRow = {
  id: "book-1", scopeId: "global", name: "Primary Math",
  educationStage: "primary", quantity: 2, createdAt: now, updatedAt: now, deletedAt: null,
};
const emptyBook: BookRow = {
  id: "book-2", scopeId: "global", name: "Primary Science",
  educationStage: "primary", quantity: 0, createdAt: now, updatedAt: now, deletedAt: null,
};

function renderStudents(options: { empty?: boolean } = {}) {
  const backend = createFixtureBackend(options.empty ? {} : {
    students: [student], books: [availableBook, emptyBook],
  });
  render(
    <AppProviders backend={backend}>
      <AppShell><StudentsScreen /></AppShell>
    </AppProviders>,
  );
  return backend;
}

describe("StudentsScreen", () => {
  it("creates a student in a stable editor sheet", async () => {
    const user = userEvent.setup();
    const backend = renderStudents({ empty: true });

    await user.click(screen.getByRole("button", { name: "Add student" }));
    const dialog = screen.getByRole("dialog", { name: "Add student" });
    await user.type(within(dialog).getByLabelText("Student name"), "Amina Hassan");
    await user.type(within(dialog).getByLabelText("Government ID"), "29901011234567");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Amina Hassan")).toBeVisible();
    expect(await backend.listStudents()).toHaveLength(1);
  });

  it("keeps selections as drafts, disables zero stock, then issues once", async () => {
    const user = userEvent.setup();
    const backend = renderStudents();

    await user.click(await screen.findByRole("button", { name: "Select student Mona Ahmed" }));
    const available = await screen.findByRole("checkbox", { name: /Primary Math/ });
    const empty = screen.getByRole("checkbox", { name: /Primary Science/ });
    expect(empty).toBeDisabled();
    await user.click(available);
    expect(await backend.listIssuedBooks("student-1")).toEqual([]);

    const confirm = screen.getByRole("button", { name: "Issue selected books" });
    await user.dblClick(confirm);

    expect(await backend.listIssuedBooks("student-1")).toHaveLength(1);
    expect((await backend.listBooks()).find(({ id }) => id === "book-1")?.quantity).toBe(1);
  });

  it("guards navigation while a draft selection exists", async () => {
    const user = userEvent.setup();
    renderStudents();
    await user.click(await screen.findByRole("button", { name: "Select student Mona Ahmed" }));
    await user.click(await screen.findByRole("checkbox", { name: /Primary Math/ }));

    await user.click(screen.getByRole("button", { name: "Books" }));

    const dialog = screen.getByRole("dialog", { name: "Discard book selection?" });
    expect(dialog).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Students" })).toHaveAttribute("aria-pressed", "true");
  });

  it("requires a concrete grade before export", async () => {
    const user = userEvent.setup();
    renderStudents();
    const exportButton = screen.getByRole("button", { name: "Export grade" });
    expect(exportButton).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "Grade level" }));
    await user.click(screen.getByRole("option", { name: "1st Primary" }));

    expect(exportButton).toBeEnabled();
  });
});
