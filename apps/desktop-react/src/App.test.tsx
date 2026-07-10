import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the React desktop entry surface", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Student Book Tracker" }),
    ).toBeInTheDocument();
  });
});
