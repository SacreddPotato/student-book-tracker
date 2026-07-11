export type ParsedAcademicYear = {
  startYear: number;
  endYear: number;
};

const academicYearPattern = /^(\d{4})-(\d{4})$/;

export function parseAcademicYear(value: string): ParsedAcademicYear {
  const match = academicYearPattern.exec(value);
  const startYear = match ? Number(match[1]) : Number.NaN;
  const endYear = match ? Number(match[2]) : Number.NaN;
  if (!match || endYear !== startYear + 1) {
    throw new Error(
      "Academic year must contain consecutive years in YYYY-YYYY format.",
    );
  }
  return { startYear, endYear };
}

export function nextAcademicYear(value: string): string {
  const { endYear } = parseAcademicYear(value);
  return `${endYear}-${endYear + 1}`;
}

export function isNextAcademicYear(current: string, candidate: string): boolean {
  try {
    return nextAcademicYear(current) === candidate;
  } catch {
    return false;
  }
}
