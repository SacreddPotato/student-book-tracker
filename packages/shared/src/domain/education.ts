export const educationStages = ["kg", "primary", "preparatory"] as const;

export type EducationStage = (typeof educationStages)[number];

export const gradeLevelsByStage = {
  kg: ["kg1", "kg2"],
  primary: [
    "primary1",
    "primary2",
    "primary3",
    "primary4",
    "primary5",
    "primary6",
  ],
  preparatory: ["preparatory1", "preparatory2", "preparatory3"],
} as const satisfies Record<EducationStage, readonly string[]>;

export type GradeLevel = (typeof gradeLevelsByStage)[EducationStage][number];

export function isGradeAllowedForStage(
  stage: EducationStage,
  gradeLevel: GradeLevel,
): boolean {
  return (gradeLevelsByStage[stage] as readonly GradeLevel[]).includes(gradeLevel);
}
