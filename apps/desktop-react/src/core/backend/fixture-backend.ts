import { isGradeAllowedForStage } from "@app/shared";

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
  students?: StudentRow[];
  books?: BookRow[];
  transactions?: InventoryTransactionRow[];
  items?: InventoryTransactionItemRow[];
  studentBooks?: StudentBookRow[];
  conflicts?: SyncConflict[];
};

export function createFixtureBackend(seed: FixtureSeed = {}): AppBackend {
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
  const syncStore = createExternalStore<SyncStatus>({
    ...initialSyncStatus,
    phase: "synced",
  });
  const updater = createUpdaterController({
    currentVersion: "0.1.0-demo.5",
    enabled: false,
    loadClient: async () => ({ check: async () => null }),
  });

  const backend: AppBackend = {
    async initialize() {},
    async listStudents() {
      return students.filter(({ deletedAt }) => !deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async saveStudent(input: StudentInput) {
      if (!input.name.trim() || !input.governmentId.trim()) {
        throw new Error("Student name and government ID are required.");
      }
      if (!isGradeAllowedForStage(input.educationStage, input.gradeLevel)) {
        throw new Error("The grade level does not belong to the selected education stage.");
      }
      const existing = input.id ? students.find(({ id }) => id === input.id) : undefined;
      const timestamp = now();
      const row: StudentRow = {
        id: existing?.id ?? input.id ?? createId("student"),
        scopeId: existing?.scopeId ?? "global",
        name: input.name.trim(),
        governmentId: input.governmentId.trim(),
        educationStage: input.educationStage,
        gradeLevel: input.gradeLevel,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      if (existing) Object.assign(existing, row); else students.push(row);
      return structuredClone(row);
    },
    async listBooks() {
      return books.filter(({ deletedAt }) => !deletedAt)
        .sort((a, b) => a.educationStage.localeCompare(b.educationStage)
          || a.name.localeCompare(b.name));
    },
    async saveBook(input: BookInput) {
      if (!input.name.trim()) throw new Error("Book name is required.");
      const existing = input.id ? books.find(({ id }) => id === input.id) : undefined;
      const timestamp = now();
      const row: BookRow = {
        id: existing?.id ?? input.id ?? createId("book"),
        scopeId: existing?.scopeId ?? "global",
        name: input.name.trim(),
        educationStage: input.educationStage,
        quantity: existing?.quantity ?? 0,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      if (existing) Object.assign(existing, row); else books.push(row);
      return structuredClone(row);
    },
    async listIssuedBooks(studentId) {
      return studentBooks.filter((row) => row.studentId === studentId && !row.reversedAt);
    },
    async addStock({ bookId, quantity }) {
      const book = books.find(({ id }) => id === bookId);
      if (!book) throw new Error(`Unknown book: ${bookId}`);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Stock quantity must be a positive integer.");
      }
      const timestamp = now();
      book.quantity += quantity;
      book.updatedAt = timestamp;
      const transactionId = createId("transaction");
      transactions.unshift({
        id: transactionId, scopeId: "global", type: "stock_increase",
        studentId: null, reversedTransactionId: null, reversedByTransactionId: null,
        deviceId: "fixture", commandId: createId("command"),
        occurredAt: timestamp, createdAt: timestamp,
      });
      items.push({
        id: createId("item"), transactionId, bookId, quantityDelta: quantity,
        quantityAfter: book.quantity, createdAt: timestamp,
      });
    },
    async issueBooks({ studentId, bookIds }) {
      const student = students.find(({ id }) => id === studentId);
      if (!student) throw new Error(`Unknown student: ${studentId}`);
      const selected = bookIds.map((id) => books.find((book) => book.id === id));
      if (selected.some((book) => !book)) throw new Error("Unknown book.");
      const resolved = selected as BookRow[];
      if (resolved.some((book) => book.educationStage !== student.educationStage)) {
        throw new Error("Books must match the student education stage.");
      }
      if (resolved.some((book) => book.quantity <= 0)) {
        throw new Error("Cannot issue books with zero stock.");
      }
      const timestamp = now();
      const transactionId = createId("transaction");
      transactions.unshift({
        id: transactionId, scopeId: "global", type: "student_issue",
        studentId, reversedTransactionId: null, reversedByTransactionId: null,
        deviceId: "fixture", commandId: createId("command"),
        occurredAt: timestamp, createdAt: timestamp,
      });
      for (const book of resolved) {
        book.quantity -= 1;
        book.updatedAt = timestamp;
        items.push({
          id: createId("item"), transactionId, bookId: book.id,
          quantityDelta: -1, quantityAfter: book.quantity, createdAt: timestamp,
        });
        studentBooks.push({
          id: createId("student-book"), scopeId: "global", studentId,
          bookId: book.id, issuedTransactionId: transactionId,
          createdAt: timestamp, reversedAt: null,
        });
      }
    },
    async listLogs() {
      return transactions.map((transaction): LogEntry => ({
        ...structuredClone(transaction),
        studentName: students.find(({ id }) => id === transaction.studentId)?.name ?? null,
        items: items.filter(({ transactionId }) => transactionId === transaction.id)
          .map((item) => ({
            ...structuredClone(item),
            bookName: books.find(({ id }) => id === item.bookId)?.name ?? "Unknown book",
          })),
      }));
    },
    async reverseTransaction(transactionId) {
      const original = transactions.find(({ id }) => id === transactionId);
      if (!original) throw new Error(`Unknown transaction: ${transactionId}`);
      if (original.reversedByTransactionId) throw new Error("Transaction already reversed.");
      if (original.type === "reversal") throw new Error("Cannot reverse a reversal transaction.");
      const timestamp = now();
      const reversalId = createId("transaction");
      const originalItems = items.filter((item) => item.transactionId === original.id);
      const reversalItems = originalItems.map((item) => {
        const book = books.find(({ id }) => id === item.bookId)!;
        book.quantity -= item.quantityDelta;
        book.updatedAt = timestamp;
        return {
          id: createId("item"), transactionId: reversalId, bookId: book.id,
          quantityDelta: -item.quantityDelta, quantityAfter: book.quantity,
          createdAt: timestamp,
        };
      });
      original.reversedByTransactionId = reversalId;
      transactions.unshift({
        id: reversalId, scopeId: "global", type: "reversal",
        studentId: original.studentId, reversedTransactionId: original.id,
        reversedByTransactionId: null, deviceId: "fixture",
        commandId: createId("command"), occurredAt: timestamp, createdAt: timestamp,
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
      const unacknowledgedRejectedCount = conflicts.filter(
        (conflict) => !conflict.acknowledged && !acknowledged.has(conflict.commandId),
      ).length;
      const current = syncStore.getSnapshot();
      syncStore.update({
        unacknowledgedRejectedCount,
        phase: current.phase === "rejected" && unacknowledgedRejectedCount === 0
          ? "synced"
          : current.phase,
      });
    },
    async requestSync() {
      syncStore.update({ phase: "syncing" });
      const unacknowledgedRejectedCount = conflicts.filter(
        (conflict) => !conflict.acknowledged && !acknowledged.has(conflict.commandId),
      ).length;
      syncStore.update({
        phase: unacknowledgedRejectedCount ? "rejected" : "synced",
        rejectedCount: conflicts.length,
        unacknowledgedRejectedCount,
        lastSyncedAt: now(),
        message: unacknowledgedRejectedCount ? "A sync command was rejected." : null,
      });
    },
    syncStore,
    updater,
  };

  return backend;
}
