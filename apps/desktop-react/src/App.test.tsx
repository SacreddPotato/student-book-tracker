import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createFixtureBackend } from "./core/backend/fixture-backend";
import App from "./App";

describe("App", () => {
  it("renders the React desktop entry surface", () => {
    render(<App backend={createFixtureBackend()} />);

    expect(screen.getByRole("button", { name: "Students" })).toBeVisible();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
