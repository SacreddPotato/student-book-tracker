import { isTauri } from "@tauri-apps/api/core";

import desktopPackage from "../../../package.json";
import { resolveRuntimeConfig } from "../../app/runtime-config";
import { initializeLocalDatabase } from "../db/local-db";
import { runMigrations } from "../db/migrations";
import { listAcademicYears } from "../db/repositories/academic-years";
import { listBookRecords, listBooks } from "../db/repositories/books";
import { listStudentRecords, listStudents } from "../db/repositories/students";
import {
  listActiveStudentBookRows,
  listBookHistory,
  listInventoryTransactionItems,
  listInventoryTransactions,
} from "../db/repositories/transactions";
import type { SqlDatabase } from "../db/types";
import {
  advanceAcademicYear,
  initializeAcademicYear,
} from "../services/academic-year-service";
import {
  deleteBook,
  deleteStudent,
  saveBook,
  saveBooks,
  saveStudent,
} from "../services/entity-service";
import { addBookStock, issueBooksToStudent, reverseTransaction } from "../services/inventory-service";
import { createExternalStore } from "../state/external-store";
import { createSyncApiClient, type SyncApiClient } from "../sync/api-client";
import { acknowledgeSyncConflict, countUnacknowledgedSyncConflicts, listSyncConflicts } from "../sync/conflicts";
import { initialSyncStatus, SyncEngine } from "../sync/sync-engine";
import { CoalescingSyncRunner } from "../sync/sync-runner";
import {
  createUpdaterController,
  type UpdaterController,
} from "../updater/updater-controller";
import type { AppBackend, LogEntry } from "./types";

export function createDatabaseBackend(options: {
  database: SqlDatabase;
  client: SyncApiClient;
  updater: UpdaterController;
  autoSync?: boolean;
  now?: () => string;
  createId?: () => string;
  deviceId?: string;
}): AppBackend {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const deviceId = options.deviceId ?? "local-device";
  const syncStore = createExternalStore(initialSyncStatus);
  const engine = new SyncEngine({
    database: options.database,
    client: options.client,
    store: syncStore,
    now,
  });
  const runner = new CoalescingSyncRunner(() => engine.sync());
  const mutationContext = { database: options.database, now, createId, deviceId };
  const queueSync = () => {
    if (options.autoSync !== false) void runner.request();
  };

  return {
    async initialize() { await runMigrations(options.database); },
    listAcademicYears: () => listAcademicYears(options.database),
    async initializeAcademicYear(academicYear) {
      await initializeAcademicYear(academicYear, mutationContext);
      queueSync();
    },
    async advanceAcademicYear(toYear) {
      const sync = syncStore.getSnapshot();
      const result = await advanceAcademicYear({
        toYear,
        synchronized: sync.phase === "synced"
          && sync.pendingCount === 0
          && sync.rejectedCount === 0,
      }, mutationContext);
      queueSync();
      return result;
    },
    listStudents: (academicYear) => listStudents(options.database, academicYear),
    async saveStudent(input) {
      const row = await saveStudent(input, mutationContext);
      queueSync();
      return row;
    },
    async deleteStudent(studentId, academicYear) {
      await deleteStudent(studentId, academicYear, mutationContext);
      queueSync();
    },
    listBooks: () => listBooks(options.database),
    listBookHistory: (bookId) => listBookHistory(options.database, bookId),
    async saveBooks(input) {
      const rows = await saveBooks(input, mutationContext);
      queueSync();
      return rows;
    },
    async saveBook(input) {
      const row = await saveBook(input, mutationContext);
      queueSync();
      return row;
    },
    async deleteBook(bookId) {
      await deleteBook(bookId, mutationContext);
      queueSync();
    },
    listIssuedBooks: (academicYear, studentId) =>
      listActiveStudentBookRows(options.database, academicYear, studentId),
    async addStock(input) {
      await addBookStock(input, mutationContext);
      queueSync();
    },
    async issueBooks(input) {
      await issueBooksToStudent(input, mutationContext);
      queueSync();
    },
    async listLogs(academicYear) {
      const [transactions, students, books] = await Promise.all([
        listInventoryTransactions(options.database, academicYear),
        listStudentRecords(options.database, academicYear),
        listBookRecords(options.database),
      ]);
      const studentNames = new Map(students.map(({ id, name }) => [id, name]));
      const bookNames = new Map(books.map(({ id, name }) => [id, name]));
      return Promise.all(transactions.map(async (transaction): Promise<LogEntry> => ({
        ...transaction,
        studentName: transaction.studentId
          ? studentNames.get(transaction.studentId) ?? null
          : null,
        items: (await listInventoryTransactionItems(options.database, transaction.id))
          .map((item) => ({
            ...item,
            bookName: bookNames.get(item.bookId) ?? "Unknown book",
          })),
      })));
    },
    async reverseTransaction(academicYear, transactionId) {
      await reverseTransaction({ academicYear, transactionId }, mutationContext);
      queueSync();
    },
    listConflicts: () => listSyncConflicts(options.database),
    async acknowledgeConflict(commandId) {
      await acknowledgeSyncConflict(options.database, commandId, now());
      const unacknowledgedRejectedCount = await countUnacknowledgedSyncConflicts(options.database);
      const current = syncStore.getSnapshot();
      syncStore.update({
        unacknowledgedRejectedCount,
        phase: current.phase === "rejected" && unacknowledgedRejectedCount === 0
          ? "synced"
          : current.phase,
      });
    },
    requestSync: () => runner.request(),
    syncStore,
    updater: options.updater,
  };
}

export async function createTauriBackend(): Promise<AppBackend> {
  const runtimeConfig = resolveRuntimeConfig(import.meta.env);
  const database = await initializeLocalDatabase(runtimeConfig);
  const client = createSyncApiClient({
    apiBaseUrl: runtimeConfig.syncApiBaseUrl,
    transportToken: runtimeConfig.syncApiSharedSecret ?? null,
  });
  const updater = createUpdaterController({
    currentVersion: desktopPackage.version,
    enabled: runtimeConfig.updaterEnabled && import.meta.env.PROD && isTauri(),
    loadClient: async () => {
      const { check } = await import("@tauri-apps/plugin-updater");
      return { check };
    },
  });
  return createDatabaseBackend({ database, client, updater, autoSync: true });
}
