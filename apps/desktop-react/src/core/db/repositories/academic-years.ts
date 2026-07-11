import type { SqlDatabase } from "../types";

export type AcademicYearStatus = "current" | "archived";

export type AcademicYearRow = {
  academicYear: string;
  status: AcademicYearStatus;
  createdAt: string;
  archivedAt: string | null;
};

const academicYearSelect = `SELECT academic_year AS academicYear, status,
  created_at AS createdAt, archived_at AS archivedAt FROM academic_years`;

export function listAcademicYears(database: SqlDatabase): Promise<AcademicYearRow[]> {
  return database.select(`${academicYearSelect} ORDER BY academic_year DESC`);
}

export async function getCurrentAcademicYear(database: SqlDatabase) {
  const rows = await database.select<AcademicYearRow>(
    `${academicYearSelect} WHERE status = 'current'`,
  );
  return rows[0] ?? null;
}

export async function createInitialAcademicYear(
  database: SqlDatabase,
  academicYear: string,
  createdAt: string,
) {
  await database.execute(
    `INSERT INTO academic_years (academic_year, status, created_at, archived_at)
      VALUES ($1, 'current', $2, NULL)`,
    [academicYear, createdAt],
  );
}

export async function upsertAcademicYear(database: SqlDatabase, row: AcademicYearRow) {
  await database.execute(
    `INSERT INTO academic_years (academic_year, status, created_at, archived_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(academic_year) DO UPDATE SET status = excluded.status,
        created_at = excluded.created_at, archived_at = excluded.archived_at`,
    [row.academicYear, row.status, row.createdAt, row.archivedAt],
  );
}

export async function archiveAcademicYear(
  database: SqlDatabase,
  academicYear: string,
  archivedAt: string,
) {
  await database.execute(
    `UPDATE academic_years SET status = 'archived', archived_at = $1
      WHERE academic_year = $2 AND status = 'current'`,
    [archivedAt, academicYear],
  );
}
