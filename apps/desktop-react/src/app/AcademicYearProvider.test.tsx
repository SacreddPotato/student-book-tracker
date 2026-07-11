import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createFixtureBackend } from "../core/backend/fixture-backend";
import { AcademicYearProvider, useAcademicYear } from "./AcademicYearProvider";

function Harness() {
  const year = useAcademicYear();
  return <>
    <span>{year.currentYear ?? "unset"}:{year.viewYear ?? "unset"}:{year.archived ? "archived" : "editable"}</span>
    <button onClick={() => year.initialize("2025-2026")}>Initialize</button>
    <button onClick={() => year.setViewYear("2025-2026")}>View old</button>
  </>;
}

describe("AcademicYearProvider", () => {
  it("exposes setup state and refreshes after initialization", async () => {
    const user = userEvent.setup();
    render(<AcademicYearProvider backend={createFixtureBackend()}><Harness /></AcademicYearProvider>);
    expect(await screen.findByText("unset:unset:editable")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Initialize" }));
    await waitFor(() => expect(screen.getByText("2025-2026:2025-2026:editable")).toBeVisible());
  });

  it("marks an archived selected year read only", async () => {
    const backend = createFixtureBackend();
    await backend.initializeAcademicYear("2025-2026");
    await backend.advanceAcademicYear("2026-2027");
    const user = userEvent.setup();
    render(<AcademicYearProvider backend={backend}><Harness /></AcademicYearProvider>);
    expect(await screen.findByText("2026-2027:2026-2027:editable")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "View old" }));
    expect(screen.getByText("2026-2027:2025-2026:archived")).toBeVisible();
  });
});
