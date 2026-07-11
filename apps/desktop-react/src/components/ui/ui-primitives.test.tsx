import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Checkbox } from "./Checkbox";

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

  it("centers the checkbox indicator across the full control", () => {
    render(<Checkbox checked onCheckedChange={() => undefined} label="Primary Math" />);
    const checkbox = screen.getByRole("checkbox", { name: "Primary Math" });
    const indicator = checkbox.querySelector(".ui-checkbox-indicator");
    const checkmark = checkbox.querySelector<SVGElement>(".ui-checkbox-checkmark");

    expect(indicator).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("dir", "ltr");
    expect(indicator).toContainElement(checkmark);
    expect(checkmark).toHaveClass("lucide-check");
    expect(checkmark).toHaveAttribute("width", "14");
    expect(checkmark).toHaveAttribute("height", "14");
  });
});
