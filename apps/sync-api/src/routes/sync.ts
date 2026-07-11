import { timingSafeEqual } from "node:crypto";

import { parseAcademicYear, type SyncCommand } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import { applyCommand } from "../services/apply-command";
import { parsePullCursor, type SyncChangeReader } from "../services/pull-changes";
import type { SyncStore } from "../services/sync-store";

export const syncApiTokenHeader = "x-sync-api-key";

const commandBase = {
  id: z.string().trim().min(1),
  deviceId: z.string().trim().min(1),
  occurredAt: z.string().datetime({ offset: true }),
};

const academicYearSchema = z.string().refine((value) => {
  try { parseAcademicYear(value); return true; } catch { return false; }
}, "Academic year must use consecutive YYYY-YYYY years.");
const semesterSchema = z.enum(["first", "second"]);
const receiptDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}, "Receipt date must be a real ISO calendar date.");
const educationStageSchema = z.enum(["kg", "primary", "preparatory"]);
const gradeLevelSchema = z.enum([
  "kg1", "kg2", "primary1", "primary2", "primary3", "primary4",
  "primary5", "primary6", "preparatory1", "preparatory2", "preparatory3",
]);
const promotedStudentSchema = z.object({
  id: z.string().trim().min(1),
  previousStudentId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  governmentId: z.string().trim().min(1),
  educationStage: educationStageSchema,
  gradeLevel: gradeLevelSchema,
  academicYear: academicYearSchema,
});

const syncCommandSchema = z.discriminatedUnion("type", [
  z.object({
    ...commandBase,
    type: z.literal("ADD_BOOK_STOCK"),
    academicYear: academicYearSchema,
    bookId: z.string().trim().min(1),
    semester: semesterSchema,
    quantity: z.number().int().positive(),
    receiptNumber: z.string().trim().min(1),
    receiptDate: receiptDateSchema,
  }),
  z.object({
    ...commandBase,
    type: z.literal("ISSUE_BOOKS_TO_STUDENT"),
    academicYear: academicYearSchema,
    studentId: z.string().trim().min(1),
    bookSelections: z.array(z.object({
      bookId: z.string().trim().min(1),
      semester: semesterSchema,
    })).min(1),
  }),
  z.object({
    ...commandBase,
    type: z.literal("REVERSE_TRANSACTION"),
    academicYear: academicYearSchema,
    transactionId: z.string().trim().min(1),
  }),
  z.object({
    ...commandBase,
    type: z.literal("UPSERT_STUDENT"),
    student: z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      governmentId: z.string().trim().min(1),
      educationStage: educationStageSchema,
      gradeLevel: gradeLevelSchema,
      academicYear: academicYearSchema,
      previousStudentId: z.string().trim().min(1).nullable(),
    }),
  }),
  z.object({
    ...commandBase,
    type: z.literal("UPSERT_BOOK"),
    book: z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      educationStage: educationStageSchema,
    }),
  }),
  z.object({
    ...commandBase,
    type: z.literal("INITIALIZE_ACADEMIC_YEAR"),
    academicYear: academicYearSchema,
  }),
  z.object({
    ...commandBase,
    type: z.literal("ADVANCE_ACADEMIC_YEAR"),
    fromYear: academicYearSchema,
    toYear: academicYearSchema,
    promotedStudents: z.array(promotedStudentSchema),
  }),
]);

const pushRequestSchema = z.object({ commands: z.array(syncCommandSchema).min(1) });

type SyncRoutesOptions = {
  sharedSecret: string;
  store: SyncStore;
  changeReader: SyncChangeReader;
};

export function createSyncRoutes(options: SyncRoutesOptions): Hono {
  const app = new Hono();

  app.use("/*", async (context, next) => {
    const suppliedSecret = context.req.header(syncApiTokenHeader);
    if (!suppliedSecret || !secretsMatch(suppliedSecret, options.sharedSecret)) {
      return context.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });

  app.post("/push", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = pushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: "Invalid sync command payload", issues: parsed.error.issues },
        400,
      );
    }

    const results = [];
    for (const command of parsed.data.commands) {
      results.push(await applyCommand(options.store, command as SyncCommand));
    }

    return context.json({ results });
  });

  app.get("/pull", async (context) => {
    const since = parsePullCursor(context.req.query("since"));
    if (since === null) {
      return context.json({ error: "Invalid pull cursor" }, 400);
    }

    return context.json(await options.changeReader.pull(since));
  });

  return app;
}

function secretsMatch(suppliedSecret: string, expectedSecret: string): boolean {
  const supplied = Buffer.from(suppliedSecret);
  const expected = Buffer.from(expectedSecret);

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
