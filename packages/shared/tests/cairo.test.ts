import { describe, expect, it } from "vitest";

import { formatCairoDateTime } from "../src/time/cairo";

describe("Cairo time formatting", () => {
  it("formats UTC timestamps in the Africa/Cairo time zone", () => {
    expect(formatCairoDateTime("2026-07-08T10:15:00.000Z")).toBe("Jul 8, 2026, 1:15 PM");
  });
});
