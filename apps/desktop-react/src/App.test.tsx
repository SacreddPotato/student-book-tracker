import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createFixtureBackend } from "./core/backend/fixture-backend";
import App from "./App";

describe("App", () => {
  it("renders the React desktop entry surface", () => {
    render(<App backend={createFixtureBackend()} />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("syncs on startup and reconnect, then refreshes active local queries", async () => {
    const backend = createFixtureBackend();
    backend.requestSync = vi.fn(async () => undefined);
    const listStudents = vi.spyOn(backend, "listStudents");
    render(<App backend={backend} />);

    await waitFor(() => expect(backend.requestSync).toHaveBeenCalledOnce());
    await waitFor(() => expect(listStudents).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(backend.requestSync).toHaveBeenCalledTimes(2));

    backend.syncStore.update({ phase: "syncing" });
    backend.syncStore.update({ phase: "synced" });
    await waitFor(() => expect(listStudents.mock.calls.length).toBeGreaterThan(1));
  });
});
