import { describe, expect, it } from "vitest";

import {
  educationStages,
  gradeLevelsByStage,
  isGradeAllowedForStage,
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
});
