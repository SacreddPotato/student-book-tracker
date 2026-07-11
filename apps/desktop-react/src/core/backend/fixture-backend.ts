import {
  isGradeAllowedForStage,
  nextAcademicYear,
  parseAcademicYear,
  promoteGrade,
  type BookSelection,
  type BookSemester,
} from "@app/shared";

import type { AcademicYearRow } from "../db/repositories/academic-years";
import type { BookRow } from "../db/repositories/books";
import type { StudentRow } from "../db/repositories/students";
import type {
  InventoryTransactionItemRow,
  InventoryTransactionRow,
  StudentBookRow,
} from "../db/repositories/transactions";
import { createExternalStore } from "../state/external-store";
import type { SyncConflict } from "../sync/conflicts";
import { initialSyncStatus, type SyncStatus } from "../sync/sync-engine";
import { createUpdaterController } from "../updater/updater-controller";
import type { AppBackend, BookInput, LogEntry, StudentInput } from "./types";

export type FixtureSeed = {
  academicYears?: AcademicYearRow[];
  students?: StudentRow[];
  books?: BookRow[];
  transactions?: InventoryTransactionRow[];
  items?: InventoryTransactionItemRow[];
  studentBooks?: StudentBookRow[];
  conflicts?: SyncConflict[];
};

export function createFixtureBackend(seed: FixtureSeed = {}): AppBackend {
  const academicYears = structuredClone(seed.academicYears ?? []);
  const students = structuredClone(seed.students ?? []);
  const books = structuredClone(seed.books ?? []);
  const transactions = structuredClone(seed.transactions ?? []);
  const items = structuredClone(seed.items ?? []);
  const studentBooks = structuredClone(seed.studentBooks ?? []);
  const conflicts = structuredClone(seed.conflicts ?? []);
  const acknowledged = new Set<string>();
  let sequence = 0;
  const createId = (prefix: string) => `${prefix}-${++sequence}`;
  const now = () => new Date(2026, 6, 8, 12, sequence).toISOString();
  const syncStore = createExternalStore<SyncStatus>({ ...initialSyncStatus, phase: "synced" });
  const updater = createUpdaterController({
    currentVersion: "0.1.0-demo.5",
    enabled: false,
    loadClient: async () => ({ check: async () => null }),
  });

  const currentYear = () => academicYears.find(({ status }) => status === "current") ?? null;
  const assertCurrentYear = (academicYear: string) => {
    if (currentYear()?.academicYear !== academicYear) {
      throw new Error(`Academic year is archived: ${academicYear}`);
    }
  };
  const semesterQuantity = (book: BookRow, semester: BookSemester) =>
    semester === "first" ? book.firstSemesterQuantity : book.secondSemesterQuantity;
  const setSemesterQuantity = (book: BookRow, semester: BookSemester, quantity: number) => {
    if (semester === "first") book.firstSemesterQuantity = quantity;
    else book.secondSemesterQuantity = quantity;
  };
  const selectionKey = ({ bookId, semester }: BookSelection) => `${bookId}:${semester}`;
  const validDate = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    return date.toISOString().slice(0, 10) === value;
  };

  const backend: AppBackend = {
    async initialize() {},
    async listAcademicYears() {
      return structuredClone(academicYears).sort((a, b) =>
        b.academicYear.localeCompare(a.academicYear));
    },
    async initializeAcademicYear(academicYear) {
      parseAcademicYear(academicYear);
      if (currentYear()) throw new Error("Academic year is already initialized.");
      const timestamp = now();
      academicYears.push({ academicYear, status: "current", createdAt: timestamp, archivedAt: null });
    },
    async advanceAcademicYear(toYear) {
      const current = currentYear();
      if (!current) throw new Error("Academic year is not initialized.");
      if (nextAcademicYear(current.academicYear) !== toYear) {
        throw new Error("Academic year must advance to the exact successor.");
      }
      const timestamp = now();
      const source = students.filter((row) =>
        row.academicYear === current.academicYear && !row.deletedAt);
      const promoted = source.flatMap((student) => {
        const next = promoteGrade(student.gradeLevel);
        if (!next) return [];
        return [{
          ...student,
          id: createId("student"),
          academicYear: toYear,
          previousStudentId: student.id,
          educationStage: next.educationStage,
          gradeLevel: next.gradeLevel,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        } satisfies StudentRow];
      });
      current.status = "archived";
      current.archivedAt = timestamp;
      academicYears.push({ academicYear: toYear, status: "current", createdAt: timestamp, archivedAt: null });
      students.push(...promoted);
      return {
        fromYear: current.academicYear,
        toYear,
        promotedCount: promoted.length,
        voidedCount: source.length - promoted.length,
      };
    },
    async listStudents(academicYear) {
      return structuredClone(students.filter((row) =>
        row.academicYear === academicYear && !row.deletedAt))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async saveStudent(input: StudentInput) {
      assertCurrentYear(input.academicYear);
      if (!input.name.trim() || !input.governmentId.trim()) {
        throw new Error("Student name and government ID are required.");
      }
      if (!isGradeAllowedForStage(input.educationStage, input.gradeLevel)) {
        throw new Error("The grade level does not belong to the selected education stage.");
      }
      const existing = input.id ? students.find(({ id }) => id === input.id) : undefined;
      if (existing && existing.academicYear !== input.academicYear) {
        throw new Error("Archived academic year students cannot be changed.");
      }
      const timestamp = now();
      const row: StudentRow = {
        id: existing?.id ?? input.id ?? createId("student"),
        scopeId: existing?.scopeId ?? "global",
        name: input.name.trim(), governmentId: input.governmentId.trim(),
        educationStage: input.educationStage, gradeLevel: input.gradeLevel,
        academicYear: input.academicYear,
        previousStudentId: existing?.previousStudentId ?? null,
        createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, deletedAt: null,
      };
      if (existing) Object.assign(existing, row); else students.push(row);
      return structuredClone(row);
    },
    async listBooks() {
      return structuredClone(books.filter(({ deletedAt }) => !deletedAt))
        .sort((a, b) => a.educationStage.localeCompare(b.educationStage)
          || a.name.localeCompare(b.name));
    },
    async saveBook(input: BookInput) {
      if (!input.name.trim()) throw new Error("Book name is required.");
      const existing = input.id ? books.find(({ id }) => id === input.id) : undefined;
      const timestamp = now();
      const row: BookRow = {
        id: existing?.id ?? input.id ?? createId("book"), scopeId: existing?.scopeId ?? "global",
        name: input.name.trim(), educationStage: input.educationStage,
        firstSemesterQuantity: existing?.firstSemesterQuantity ?? 0,
        secondSemesterQuantity: existing?.secondSemesterQuantity ?? 0,
        createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, deletedAt: null,
      };
      if (existing) Object.assign(existing, row); else books.push(row);
      return structuredClone(row);
    },
    async listIssuedBooks(academicYear, studentId) {
      return structuredClone(studentBooks.filter((row) =>
        row.academicYear === academicYear && row.studentId === studentId && !row.reversedAt));
    },
    async addStock(input) {
      assertCurrentYear(input.academicYear);
      const book = books.find(({ id }) => id === input.bookId);
      if (!book) throw new Error(`Unknown book: ${input.bookId}`);
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
        throw new Error("Stock quantity must be a positive integer.");
      }
      const receiptNumber = input.receiptNumber.trim();
      if (!receiptNumber) throw new Error("Receipt number is required.");
      if (!validDate(input.receiptDate)) throw new Error("Receipt date is invalid.");
      const timestamp = now();
      const quantityAfter = semesterQuantity(book, input.semester) + input.quantity;
      setSemesterQuantity(book, input.semester, quantityAfter);
      book.updatedAt = timestamp;
      const transactionId = createId("transaction");
      transactions.unshift({
        id: transactionId, scopeId: "global", academicYear: input.academicYear,
        type: "stock_increase", studentId: null, receiptNumber, receiptDate: input.receiptDate,
        reversedTransactionId: null, reversedByTransactionId: null,
        deviceId: "fixture", commandId: createId("command"), occurredAt: timestamp, createdAt: timestamp,
      });
      items.push({
        id: createId("item"), transactionId, bookId: book.id, semester: input.semester,
        quantityDelta: input.quantity, quantityAfter, createdAt: timestamp,
      });
    },
    async issueBooks(input) {
      assertCurrentYear(input.academicYear);
      const student = students.find(({ id, deletedAt }) =>
        id === input.studentId && !deletedAt);
      if (!student || student.academicYear !== input.academicYear) {
        throw new Error(`Unknown student: ${input.studentId}`);
      }
      if (!input.bookSelections.length) throw new Error("Select at least one book semester.");
      if (new Set(input.bookSelections.map(selectionKey)).size !== input.bookSelections.length) {
        throw new Error("Duplicate book semester selection.");
      }
      const selected = input.bookSelections.map((selection) => ({
        selection,
        book: books.find(({ id }) => id === selection.bookId),
      }));
      if (selected.some(({ book }) => !book)) throw new Error("Unknown book.");
      if (selected.some(({ book }) => book!.educationStage !== student.educationStage)) {
        throw new Error("Books must match the student education stage.");
      }
      if (selected.some(({ book, selection }) => semesterQuantity(book!, selection.semester) <= 0)) {
        throw new Error("Cannot issue books with zero stock.");
      }
      const timestamp = now();
      const transactionId = createId("transaction");
      transactions.unshift({
        id: transactionId, scopeId: "global", academicYear: input.academicYear,
        type: "student_issue", studentId: student.id, receiptNumber: null, receiptDate: null,
        reversedTransactionId: null, reversedByTransactionId: null,
        deviceId: "fixture", commandId: createId("command"), occurredAt: timestamp, createdAt: timestamp,
      });
      for (const { book, selection } of selected) {
        const quantityAfter = semesterQuantity(book!, selection.semester) - 1;
        setSemesterQuantity(book!, selection.semester, quantityAfter);
        book!.updatedAt = timestamp;
        items.push({
          id: createId("item"), transactionId, bookId: book!.id, semester: selection.semester,
          quantityDelta: -1, quantityAfter, createdAt: timestamp,
        });
        studentBooks.push({
          id: createId("student-book"), scopeId: "global", academicYear: input.academicYear,
          studentId: student.id, bookId: book!.id, semester: selection.semester,
          issuedTransactionId: transactionId, createdAt: timestamp, reversedAt: null,
        });
      }
    },
    async listLogs(academicYear) {
      return transactions.filter((row) => row.academicYear === academicYear)
        .map((transaction): LogEntry => ({
          ...structuredClone(transaction),
          studentName: students.find(({ id }) => id === transaction.studentId)?.name ?? null,
          items: items.filter(({ transactionId }) => transactionId === transaction.id)
            .map((item) => ({
              ...structuredClone(item),
              bookName: books.find(({ id }) => id === item.bookId)?.name ?? "Unknown book",
            })),
        }));
    },
    async reverseTransaction(academicYear, transactionId) {
      assertCurrentYear(academicYear);
      const original = transactions.find(({ id }) => id === transactionId);
      if (!original || original.academicYear !== academicYear) {
        throw new Error(`Unknown transaction: ${transactionId}`);
      }
      if (original.reversedByTransactionId) throw new Error("Transaction already reversed.");
      if (original.type === "reversal") throw new Error("Cannot reverse a reversal transaction.");
      const timestamp = now();
      const reversalId = createId("transaction");
      const reversalItems = items.filter((item) => item.transactionId === original.id).map((item) => {
        const book = books.find(({ id }) => id === item.bookId)!;
        const quantityAfter = semesterQuantity(book, item.semester) - item.quantityDelta;
        setSemesterQuantity(book, item.semester, quantityAfter);
        book.updatedAt = timestamp;
        return {
          id: createId("item"), transactionId: reversalId, bookId: book.id,
          semester: item.semester, quantityDelta: -item.quantityDelta,
          quantityAfter, createdAt: timestamp,
        };
      });
      original.reversedByTransactionId = reversalId;
      transactions.unshift({
        id: reversalId, scopeId: "global", academicYear, type: "reversal",
        studentId: original.studentId, receiptNumber: null, receiptDate: null,
        reversedTransactionId: original.id, reversedByTransactionId: null,
        deviceId: "fixture", commandId: createId("command"), occurredAt: timestamp, createdAt: timestamp,
      });
      items.push(...reversalItems);
      if (original.type === "student_issue") {
        studentBooks.filter((row) => row.issuedTransactionId === original.id && !row.reversedAt)
          .forEach((row) => { row.reversedAt = timestamp; });
      }
    },
    async listConflicts() {
      return conflicts.map((conflict) => ({
        ...structuredClone(conflict),
        acknowledged: acknowledged.has(conflict.commandId) || conflict.acknowledged,
      }));
    },
    async acknowledgeConflict(commandId) {
      acknowledged.add(commandId);
      const count = conflicts.filter((conflict) =>
        !conflict.acknowledged && !acknowledged.has(conflict.commandId)).length;
      const current = syncStore.getSnapshot();
      syncStore.update({
        unacknowledgedRejectedCount: count,
        phase: current.phase === "rejected" && count === 0 ? "synced" : current.phase,
      });
    },
    async requestSync() {
      syncStore.update({ phase: "syncing" });
      const count = conflicts.filter((conflict) =>
        !conflict.acknowledged && !acknowledged.has(conflict.commandId)).length;
      syncStore.update({
        phase: count ? "rejected" : "synced", rejectedCount: conflicts.length,
        unacknowledgedRejectedCount: count, lastSyncedAt: now(),
        message: count ? "A sync command was rejected." : null,
      });
    },
    syncStore,
    updater,
  };

  return backend;
}
