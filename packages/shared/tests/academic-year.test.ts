import { describe, expect, it } from "vitest";

import {
  isNextAcademicYear,
  nextAcademicYear,
  parseAcademicYear,
} from "../src/domain/academic-year";

describe("academic year domain", () => {
  it("parses consecutive four-digit academic years", () => {
    expect(parseAcademicYear("2025-2026")).toEqual({
      startYear: 2025,
      endYear: 2026,
    });
  });

  it.each(["2025-2027", "2026-2025", "25-26", "2025/2026", " 2025-2026 "])(
    "rejects invalid academic year %s",
    (value) => {
      expect(() => parseAcademicYear(value)).toThrow(
        "Academic year must contain consecutive years in YYYY-YYYY format.",
      );
    },
  );

  it("calculates and compares exact successor years", () => {
    expect(nextAcademicYear("2025-2026")).toBe("2026-2027");
    expect(isNextAcademicYear("2025-2026", "2026-2027")).toBe(true);
    expect(isNextAcademicYear("2025-2026", "2027-2028")).toBe(false);
  });
});
