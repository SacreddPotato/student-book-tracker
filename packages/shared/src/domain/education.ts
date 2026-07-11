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

const gradeProgression: readonly GradeLevel[] = [
  "kg1",
  "kg2",
  "primary1",
  "primary2",
  "primary3",
  "primary4",
  "primary5",
  "primary6",
  "preparatory1",
  "preparatory2",
  "preparatory3",
];

function stageForGrade(gradeLevel: GradeLevel): EducationStage {
  for (const educationStage of educationStages) {
    if ((gradeLevelsByStage[educationStage] as readonly GradeLevel[]).includes(gradeLevel)) {
      return educationStage;
    }
  }
  throw new Error(`Unsupported grade level: ${gradeLevel}`);
}

export function promoteGrade(gradeLevel: GradeLevel): {
  gradeLevel: GradeLevel;
  educationStage: EducationStage;
} | null {
  const currentIndex = gradeProgression.indexOf(gradeLevel);
  const nextGrade = gradeProgression[currentIndex + 1];
  return nextGrade
    ? { gradeLevel: nextGrade, educationStage: stageForGrade(nextGrade) }
    : null;
}
