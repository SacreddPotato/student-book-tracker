import {
  gradeLevelsByStage,
  isGradeAllowedForStage,
  type EducationStage,
  type GradeLevel,
  type UpsertBookCommand,
  type UpsertStudentCommand,
} from "@app/shared";

import { runLocalTransaction } from "../db/local-transaction";
import { getBookById, upsertBook, type BookRow } from "../db/repositories/books";
import { enqueueSyncCommand } from "../db/repositories/outbox";
import {
  getStudentById,
  upsertStudent,
  type StudentRow,
} from "../db/repositories/students";
import type { SqlDatabase } from "../db/types";

export type EntityServiceContext = {
  database: SqlDatabase;
  deviceId?: string;
  now?: () => string;
  createId?: () => string;
};

export type StudentDraft = {
  id?: string;
  name: string;
  governmentId: string;
  educationStage: EducationStage;
  gradeLevel: GradeLevel;
  academicYear: string;
};

export type BookDraft = {
  id?: string;
  name: string;
  educationStage: EducationStage;
};

function resolve(context: EntityServiceContext) {
  return {
    ...context,
    deviceId: context.deviceId ?? "local-device",
    now: context.now ?? (() => new Date().toISOString()),
    createId: context.createId ?? (() => crypto.randomUUID()),
  };
}

export async function saveStudent(
  draft: StudentDraft,
  context: EntityServiceContext,
): Promise<StudentRow> {
  const ctx = resolve(context);
  const name = draft.name.trim();
  const governmentId = draft.governmentId.trim();
  if (!name || !governmentId) throw new Error("Student name and government ID are required.");
  if (!isGradeAllowedForStage(draft.educationStage, draft.gradeLevel)) {
    throw new Error("The grade level does not belong to the selected education stage.");
  }

  return runLocalTransaction(ctx.database, async (database) => {
    const existing = draft.id ? await getStudentById(database, draft.id) : null;
    const occurredAt = ctx.now();
    const row: StudentRow = {
      id: existing?.id ?? draft.id ?? ctx.createId(),
      scopeId: existing?.scopeId ?? "global",
      name,
      governmentId,
      educationStage: draft.educationStage,
      gradeLevel: draft.gradeLevel,
      academicYear: draft.academicYear,
      previousStudentId: existing?.previousStudentId ?? null,
      createdAt: existing?.createdAt ?? occurredAt,
      updatedAt: occurredAt,
      deletedAt: null,
    };
    const command: UpsertStudentCommand = {
      id: ctx.createId(),
      type: "UPSERT_STUDENT",
      deviceId: ctx.deviceId,
      occurredAt,
      student: {
        id: row.id,
        name: row.name,
        governmentId: row.governmentId,
        educationStage: row.educationStage,
        gradeLevel: row.gradeLevel,
        academicYear: row.academicYear,
        previousStudentId: row.previousStudentId,
      },
    };
    await upsertStudent(database, row);
    await enqueueSyncCommand(database, command, occurredAt);
    return row;
  });
}

export async function saveBook(
  draft: BookDraft,
  context: EntityServiceContext,
): Promise<BookRow> {
  const ctx = resolve(context);
  const name = draft.name.trim();
  if (!name) throw new Error("Book name is required.");

  return runLocalTransaction(ctx.database, async (database) => {
    const existing = draft.id ? await getBookById(database, draft.id) : null;
    const occurredAt = ctx.now();
    const row: BookRow = {
      id: existing?.id ?? draft.id ?? ctx.createId(),
      scopeId: existing?.scopeId ?? "global",
      name,
      educationStage: draft.educationStage,
      gradeLevel: gradeLevelsByStage[draft.educationStage][0],
      firstSemesterQuantity: existing?.firstSemesterQuantity ?? 0,
      secondSemesterQuantity: existing?.secondSemesterQuantity ?? 0,
      createdAt: existing?.createdAt ?? occurredAt,
      updatedAt: occurredAt,
      deletedAt: null,
    };
    const command: UpsertBookCommand = {
      id: ctx.createId(),
      type: "UPSERT_BOOK",
      deviceId: ctx.deviceId,
      occurredAt,
      book: {
        id: row.id,
        name: row.name,
        educationStage: row.educationStage,
        gradeLevel: row.gradeLevel,
      },
    };
    await upsertBook(database, row);
    await enqueueSyncCommand(database, command, occurredAt);
    return row;
  });
}
