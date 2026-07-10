import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";
import { Dialog } from "./Dialog";

describe("UI primitives", () => {
  it("exposes explicit visual intent", () => {
    render(<Button intent="destructive">Reverse</Button>);
    expect(screen.getByRole("button", { name: "Reverse" })).toHaveAttribute(
      "data-intent",
      "destructive",
    );
  });

  it("traps focus, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        trigger={<Button>Add stock</Button>}
        title="Add stock"
        description="Increase available quantity"
      >
        <label htmlFor="quantity">Quantity</label>
        <input id="quantity" />
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Add stock" });
    await user.click(trigger);

    expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement,
    );
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
});
