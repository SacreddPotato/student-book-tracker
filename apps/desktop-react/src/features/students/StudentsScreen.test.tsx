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
  gradeLevel: "primary1", academicYear: "2025-2026", previousStudentId: null,
  createdAt: now, updatedAt: now, deletedAt: null,
};
const availableBook: BookRow = {
  id: "book-1", scopeId: "global", name: "Primary Math",
  educationStage: "primary", firstSemesterQuantity: 2, secondSemesterQuantity: 1,
  createdAt: now, updatedAt: now, deletedAt: null,
};
const emptyBook: BookRow = {
  id: "book-2", scopeId: "global", name: "Primary Science",
  educationStage: "primary", firstSemesterQuantity: 0, secondSemesterQuantity: 0,
  createdAt: now, updatedAt: now, deletedAt: null,
};

function renderStudents(options: { empty?: boolean } = {}) {
  const backend = createFixtureBackend(options.empty ? {} : {
    academicYears: [{ academicYear: "2025-2026", status: "current", createdAt: now, archivedAt: null }],
    students: [student], books: [availableBook, emptyBook],
  });
  if (options.empty) {
    return renderStudentsWithBackend(createFixtureBackend({ academicYears: [{ academicYear: "2025-2026", status: "current", createdAt: now, archivedAt: null }] }));
  }
  return renderStudentsWithBackend(backend);
}

function renderStudentsWithBackend(backend: ReturnType<typeof createFixtureBackend>) {
  render(
    <AppProviders backend={backend} initialLanguage="en">
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
    expect(await backend.listStudents("2025-2026")).toHaveLength(1);
  }, 10_000);

  it("keeps selections as drafts, disables zero stock, then issues once", async () => {
    const user = userEvent.setup();
    const backend = renderStudents();

    await user.click(await screen.findByRole("button", { name: "Select student Mona Ahmed" }));
    await user.click(await screen.findByRole("button", { name: "Primary Math" }));
    const first = screen.getByRole("checkbox", { name: /First semester/ });
    const second = screen.getByRole("checkbox", { name: /Second semester/ });
    await user.click(first);
    await user.click(second);
    await user.click(screen.getByRole("button", { name: "Primary Science" }));
    expect(screen.getAllByRole("checkbox", { name: /First semester/ })[1]).toBeDisabled();
    expect(await backend.listIssuedBooks("2025-2026", "student-1")).toEqual([]);

    const confirm = screen.getByRole("button", { name: "Issue selected books" });
    await user.dblClick(confirm);

    expect(await backend.listIssuedBooks("2025-2026", "student-1")).toHaveLength(2);
    const updated = (await backend.listBooks()).find(({ id }) => id === "book-1");
    expect(updated).toMatchObject({ firstSemesterQuantity: 1, secondSemesterQuantity: 0 });
  });

  it("guards navigation while a draft selection exists", async () => {
    const user = userEvent.setup();
    renderStudents();
    await user.click(await screen.findByRole("button", { name: "Select student Mona Ahmed" }));
    await user.click(await screen.findByRole("button", { name: "Primary Math" }));
    await user.click(await screen.findByRole("checkbox", { name: /First semester/ }));

    await user.click(screen.getByRole("button", { name: "Books" }));

    const dialog = screen.getByRole("dialog", { name: "Discard book selection?" });
    expect(dialog).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Students" })).toHaveAttribute("aria-pressed", "true");
  });

  it("guards student editing while a draft selection exists", async () => {
    const user = userEvent.setup();
    renderStudents();
    await user.click(await screen.findByRole("button", { name: "Select student Mona Ahmed" }));
    await user.click(await screen.findByRole("button", { name: "Primary Math" }));
    await user.click(await screen.findByRole("checkbox", { name: /First semester/ }));

    await user.click(screen.getByRole("button", { name: "Edit student Mona Ahmed" }));
    const discard = screen.getByRole("dialog", { name: "Discard book selection?" });
    await user.click(within(discard).getByRole("button", { name: "Discard selection" }));

    expect(screen.getByRole("dialog", { name: "Edit student" })).toBeVisible();
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

  it("keeps archived student records selectable but removes mutation controls", async () => {
    const user = userEvent.setup();
    const backend = createFixtureBackend({
      academicYears: [
        { academicYear: "2026-2027", status: "current", createdAt: now, archivedAt: null },
        { academicYear: "2025-2026", status: "archived", createdAt: now, archivedAt: now },
      ],
      students: [student], books: [availableBook],
    });
    renderStudentsWithBackend(backend);
    await user.click(await screen.findByRole("combobox", { name: "Academic year" }));
    await user.click(screen.getByRole("option", { name: "2025-2026" }));
    expect(await screen.findByText("This academic year is archived and read only.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add student" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit student Mona Ahmed" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select student Mona Ahmed" })).toBeVisible();
  });
});
