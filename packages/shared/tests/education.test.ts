import { describe, expect, it } from "vitest";

import {
  educationStages,
  gradeLevelsByStage,
  isGradeAllowedForStage,
  promoteGrade,
  type EducationStage,
  type GradeLevel,
} from "../src/domain/education";

const allGrades = Object.values(gradeLevelsByStage).flat() as GradeLevel[];

describe("education domain", () => {
  it("defines the supported education stages in canonical order", () => {
    expect(educationStages).toEqual(["kg", "primary", "preparatory"]);
  });

  it.each(Object.entries(gradeLevelsByStage) as [EducationStage, readonly GradeLevel[]][])(
    "allows only grades configured for %s",
    (stage, allowedGrades) => {
      for (const grade of allGrades) {
        expect(isGradeAllowedForStage(stage, grade)).toBe(allowedGrades.includes(grade));
      }
    },
  );

  it.each([
    ["kg1", "kg2", "kg"],
    ["kg2", "primary1", "primary"],
    ["primary6", "preparatory1", "preparatory"],
    ["preparatory2", "preparatory3", "preparatory"],
  ] as const)("promotes %s to %s", (current, gradeLevel, educationStage) => {
    expect(promoteGrade(current)).toEqual({ gradeLevel, educationStage });
  });

  it("returns no successor for the final preparatory grade", () => {
    expect(promoteGrade("preparatory3")).toBeNull();
  });
});
