import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { NativeTitleBar } from "./NativeTitleBar";
import type { WindowControls } from "./window-controls";

function createControls(maximized = true): WindowControls {
  return {
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(maximized),
    onResized: vi.fn().mockResolvedValue(() => undefined),
  };
}

describe("NativeTitleBar", () => {
  it("wires minimize, restore, and close to the native window", async () => {
    const user = userEvent.setup();
    const controls = createControls(true);
    render(
      <AppProviders backend={createFixtureBackend()} initialLanguage="en">
        <NativeTitleBar controls={controls} />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Minimize" }));
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(controls.minimize).toHaveBeenCalledOnce();
    expect(controls.toggleMaximize).toHaveBeenCalledOnce();
    expect(controls.close).toHaveBeenCalledOnce();
  });

  it("updates the maximize label after a native resize", async () => {
    let resizeListener: (() => void) | undefined;
    const controls = createControls(false);
    vi.mocked(controls.onResized).mockImplementation(async (listener) => {
      resizeListener = listener;
      return () => undefined;
    });
    vi.mocked(controls.isMaximized)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    render(
      <AppProviders backend={createFixtureBackend()} initialLanguage="en">
        <NativeTitleBar controls={controls} />
      </AppProviders>,
    );

    expect(await screen.findByRole("button", { name: "Maximize" })).toBeVisible();
    resizeListener?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore" })).toBeVisible());
  });
});
