import {
  isGradeAllowedForStage,
  type DeleteBookCommand,
  type DeleteStudentCommand,
  type EducationStage,
  type GradeLevel,
  type UpsertBookCommand,
  type UpsertStudentCommand,
} from "@app/shared";

import { runLocalTransaction } from "../db/local-transaction";
import { getCurrentAcademicYear } from "../db/repositories/academic-years";
import {
  getBookById,
  markBookDeleted,
  upsertBook,
  type BookRow,
} from "../db/repositories/books";
import { enqueueSyncCommand } from "../db/repositories/outbox";
import {
  getStudentById,
  markStudentDeleted,
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
  gradeLevels: GradeLevel[];
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

export async function saveBooks(
  draft: BookDraft,
  context: EntityServiceContext,
): Promise<BookRow[]> {
  const ctx = resolve(context);
  const name = draft.name.trim();
  if (!name) throw new Error("Book name is required.");
  if (draft.gradeLevels.length === 0) {
    throw new Error("Select at least one grade level.");
  }
  if (new Set(draft.gradeLevels).size !== draft.gradeLevels.length) {
    throw new Error("Duplicate grade level selection.");
  }
  if (draft.gradeLevels.some((gradeLevel) =>
    !isGradeAllowedForStage(draft.educationStage, gradeLevel))) {
    throw new Error("The grade level does not belong to the selected education stage.");
  }
  if (draft.id && draft.gradeLevels.length !== 1) {
    throw new Error("Editing a book requires exactly one grade.");
  }

  return runLocalTransaction(ctx.database, async (database) => {
    const existing = draft.id ? await getBookById(database, draft.id) : null;
    if (draft.id && !existing) throw new Error(`Unknown book: ${draft.id}`);
    const occurredAt = ctx.now();
    const rows: BookRow[] = [];
    for (const gradeLevel of draft.gradeLevels) {
      const row: BookRow = {
        id: existing?.id ?? ctx.createId(),
        scopeId: existing?.scopeId ?? "global",
        name,
        educationStage: draft.educationStage,
        gradeLevel,
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
      rows.push(row);
    }
    return rows;
  });
}

export async function deleteStudent(
  studentId: string,
  academicYear: string,
  context: EntityServiceContext,
): Promise<void> {
  const ctx = resolve(context);
  await runLocalTransaction(ctx.database, async (database) => {
    const [currentYear, student] = await Promise.all([
      getCurrentAcademicYear(database),
      getStudentById(database, studentId),
    ]);
    if (!currentYear || currentYear.academicYear !== academicYear) {
      throw new Error("Student deletion is allowed only in the current academic year.");
    }
    if (!student || student.academicYear !== academicYear) {
      throw new Error(`Unknown current-year student: ${studentId}`);
    }
    const occurredAt = ctx.now();
    const command: DeleteStudentCommand = {
      id: ctx.createId(),
      type: "DELETE_STUDENT",
      deviceId: ctx.deviceId,
      occurredAt,
      studentId,
      academicYear,
    };
    await markStudentDeleted(database, studentId, occurredAt);
    await enqueueSyncCommand(database, command, occurredAt);
  });
}

export async function deleteBook(
  bookId: string,
  context: EntityServiceContext,
): Promise<void> {
  const ctx = resolve(context);
  await runLocalTransaction(ctx.database, async (database) => {
    const book = await getBookById(database, bookId);
    if (!book) throw new Error(`Unknown book: ${bookId}`);
    const occurredAt = ctx.now();
    const command: DeleteBookCommand = {
      id: ctx.createId(),
      type: "DELETE_BOOK",
      deviceId: ctx.deviceId,
      occurredAt,
      bookId,
    };
    await markBookDeleted(database, bookId, occurredAt);
    await enqueueSyncCommand(database, command, occurredAt);
  });
}
