import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createFixtureBackend } from "../../core/backend/fixture-backend";
import { AppProviders, useI18n, useNavigation } from "../../app/AppProviders";
import { AppShell } from "./AppShell";

function Harness() {
  const { language } = useI18n();
  const { screen: activeScreen } = useNavigation();
  return (
    <AppShell>
      <p>{language}:{activeScreen}</p>
    </AppShell>
  );
}

describe("AppShell", () => {
  it("renders labelled navigation and updates document direction", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders backend={createFixtureBackend()}>
        <Harness />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: "Students" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Books" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "AR" }));
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });

  it("honors an async navigation blocker", async () => {
    const user = userEvent.setup();
    function BlockedHarness() {
      const navigation = useNavigation();
      return (
        <>
          <button onClick={() => navigation.setBlocker(() => false)}>Block</button>
          <AppShell><p>{navigation.screen}</p></AppShell>
        </>
      );
    }
    render(
      <AppProviders backend={createFixtureBackend()}>
        <BlockedHarness />
      </AppProviders>,
    );
    await user.click(screen.getByRole("button", { name: "Block" }));
    await user.click(screen.getByRole("button", { name: "Books" }));
    expect(screen.getByText("students")).toBeVisible();
  });
});
