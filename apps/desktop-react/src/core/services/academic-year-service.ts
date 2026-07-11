import {
  nextAcademicYear,
  parseAcademicYear,
  promoteGrade,
  type AdvanceAcademicYearCommand,
  type InitializeAcademicYearCommand,
  type PromotedStudentSnapshot,
} from "@app/shared";

import { runLocalTransaction } from "../db/local-transaction";
import {
  archiveAcademicYear,
  createInitialAcademicYear,
  getCurrentAcademicYear,
} from "../db/repositories/academic-years";
import { enqueueSyncCommand } from "../db/repositories/outbox";
import { listStudents, upsertStudent } from "../db/repositories/students";
import type { SqlDatabase } from "../db/types";

export type AcademicYearServiceContext = {
  database: SqlDatabase;
  deviceId?: string;
  now?: () => string;
  createId?: () => string;
};

export type AcademicYearAdvanceResult = {
  fromYear: string;
  toYear: string;
  promotedCount: number;
  voidedCount: number;
};

function resolve(context: AcademicYearServiceContext) {
  return {
    database: context.database,
    deviceId: context.deviceId ?? "local-device",
    now: context.now ?? (() => new Date().toISOString()),
    createId: context.createId ?? (() => crypto.randomUUID()),
  };
}

export async function initializeAcademicYear(
  academicYear: string,
  context: AcademicYearServiceContext,
) {
  parseAcademicYear(academicYear);
  const ctx = resolve(context);
  return runLocalTransaction(ctx.database, async (database) => {
    if (await getCurrentAcademicYear(database)) {
      throw new Error("Academic year is already initialized.");
    }
    const occurredAt = ctx.now();
    const command: InitializeAcademicYearCommand = {
      id: ctx.createId(), type: "INITIALIZE_ACADEMIC_YEAR",
      deviceId: ctx.deviceId, occurredAt, academicYear,
    };
    await createInitialAcademicYear(database, academicYear, occurredAt);
    await enqueueSyncCommand(database, command, occurredAt);
  });
}

export async function advanceAcademicYear(
  input: { toYear: string; synchronized: boolean },
  context: AcademicYearServiceContext,
): Promise<AcademicYearAdvanceResult> {
  if (!input.synchronized) {
    throw new Error("Academic year advancement requires a synchronized state.");
  }
  parseAcademicYear(input.toYear);
  const ctx = resolve(context);
  return runLocalTransaction(ctx.database, async (database) => {
    const current = await getCurrentAcademicYear(database);
    if (!current) throw new Error("Academic year is not initialized.");
    if (nextAcademicYear(current.academicYear) !== input.toYear) {
      throw new Error("Academic year must advance to the exact successor.");
    }
    const occurredAt = ctx.now();
    const currentStudents = await listStudents(database, current.academicYear);
    const promotedRows = currentStudents.flatMap((student) => {
      const promotion = promoteGrade(student.gradeLevel);
      return promotion ? [{
        id: ctx.createId(), scopeId: student.scopeId, name: student.name,
        governmentId: student.governmentId,
        educationStage: promotion.educationStage, gradeLevel: promotion.gradeLevel,
        academicYear: input.toYear, previousStudentId: student.id,
        createdAt: occurredAt, updatedAt: occurredAt, deletedAt: null,
      }] : [];
    });
    const promotedStudents: PromotedStudentSnapshot[] = promotedRows.map((student) => ({
      id: student.id,
      previousStudentId: student.previousStudentId!,
      name: student.name,
      governmentId: student.governmentId,
      educationStage: student.educationStage,
      gradeLevel: student.gradeLevel,
      academicYear: student.academicYear,
    }));
    const command: AdvanceAcademicYearCommand = {
      id: ctx.createId(), type: "ADVANCE_ACADEMIC_YEAR", deviceId: ctx.deviceId,
      occurredAt, fromYear: current.academicYear, toYear: input.toYear,
      promotedStudents,
    };
    await archiveAcademicYear(database, current.academicYear, occurredAt);
    await createInitialAcademicYear(database, input.toYear, occurredAt);
    for (const student of promotedRows) await upsertStudent(database, student);
    await enqueueSyncCommand(database, command, occurredAt);
    return {
      fromYear: current.academicYear,
      toYear: input.toYear,
      promotedCount: promotedRows.length,
      voidedCount: currentStudents.length - promotedRows.length,
    };
  });
}
