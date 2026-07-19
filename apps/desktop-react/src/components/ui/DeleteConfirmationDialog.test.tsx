import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

function dialog(open: boolean, entityName: string, onConfirm: () => void) {
  return (
    <AppProviders backend={createFixtureBackend()} initialLanguage="en">
      <DeleteConfirmationDialog
        open={open}
        title="Delete book"
        description="Historical records remain available."
        entityName={entityName}
        saving={false}
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
      />
    </AppProviders>
  );
}

describe("DeleteConfirmationDialog", () => {
  it("requires the exact case-sensitive password before confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(dialog(true, "Primary Math", onConfirm));
    const modal = screen.getByRole("dialog", { name: "Delete book" });
    const password = within(modal).getByLabelText("Password");

    expect(within(modal).getByRole("button", { name: "Delete" })).toBeDisabled();
    await user.type(password, "AZ2026");
    await user.click(within(modal).getByRole("button", { name: "Delete" }));

    expect(within(modal).getByText("Incorrect password.")).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.clear(password);
    await user.type(password, "az2026");
    await user.click(within(modal).getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("submits with Enter and clears password state when reopened or retargeted", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const view = render(dialog(true, "Primary Math", onConfirm));
    let modal = screen.getByRole("dialog", { name: "Delete book" });
    await user.type(within(modal).getByLabelText("Password"), "wrong{enter}");
    expect(within(modal).getByText("Incorrect password.")).toBeVisible();

    view.rerender(dialog(false, "Primary Math", onConfirm));
    view.rerender(dialog(true, "Primary Math", onConfirm));
    modal = screen.getByRole("dialog", { name: "Delete book" });
    expect(within(modal).getByLabelText("Password")).toHaveValue("");
    expect(within(modal).queryByText("Incorrect password.")).not.toBeInTheDocument();

    await user.type(within(modal).getByLabelText("Password"), "az2026{enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);

    view.rerender(dialog(true, "Primary Science", onConfirm));
    modal = screen.getByRole("dialog", { name: "Delete book" });
    expect(within(modal).getByLabelText("Password")).toHaveValue("");
  });
});
