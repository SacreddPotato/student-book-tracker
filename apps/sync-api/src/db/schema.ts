import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const requiredRemoteTableNames = [
  "academic_years",
  "students",
  "books",
  "student_books",
  "inventory_transactions",
  "inventory_transaction_items",
  "sync_outbox",
  "sync_state",
  "app_settings",
  "sync_changes",
  "applied_sync_commands",
] as const;

export const academicYears = pgTable(
  "academic_years",
  {
    academicYear: text("academic_year").primaryKey(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    check("academic_years_status_check", sql`${table.status} IN ('current', 'archived')`),
    uniqueIndex("academic_years_single_current_unique")
      .on(table.status)
      .where(sql`${table.status} = 'current'`),
  ],
);

export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    name: text("name").notNull(),
    governmentId: text("government_id").notNull(),
    educationStage: text("education_stage").notNull(),
    gradeLevel: text("grade_level").notNull(),
    academicYear: text("academic_year").notNull(),
    previousStudentId: text("previous_student_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("students_scope_year_government_id_unique")
      .on(table.scopeId, table.academicYear, table.governmentId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const books = pgTable(
  "books",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    name: text("name").notNull(),
    educationStage: text("education_stage").notNull(),
    gradeLevel: text("grade_level").notNull(),
    firstSemesterQuantity: integer("first_semester_quantity").notNull().default(0),
    secondSemesterQuantity: integer("second_semester_quantity").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("books_scope_grade_name_unique")
      .on(table.scopeId, table.gradeLevel, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    check("books_first_semester_quantity_nonnegative", sql`${table.firstSemesterQuantity} >= 0`),
    check("books_second_semester_quantity_nonnegative", sql`${table.secondSemesterQuantity} >= 0`),
  ],
);

export const studentBooks = pgTable(
  "student_books",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    academicYear: text("academic_year").notNull(),
    studentId: text("student_id").notNull(),
    bookId: text("book_id").notNull(),
    semester: text("semester").notNull(),
    issuedTransactionId: text("issued_transaction_id").notNull(),
    createdAt: text("created_at").notNull(),
    reversedAt: text("reversed_at"),
  },
  (table) => [
    unique("student_books_scope_year_student_book_semester_transaction_unique").on(
      table.scopeId,
      table.academicYear,
      table.studentId,
      table.bookId,
      table.semester,
      table.issuedTransactionId,
    ),
    check("student_books_semester_check", sql`${table.semester} IN ('first', 'second')`),
  ],
);

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    academicYear: text("academic_year").notNull(),
    type: text("type").notNull(),
    studentId: text("student_id"),
    receiptNumber: text("receipt_number"),
    receiptDate: text("receipt_date"),
    reversedTransactionId: text("reversed_transaction_id"),
    reversedByTransactionId: text("reversed_by_transaction_id"),
    deviceId: text("device_id"),
    commandId: text("command_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("inventory_transactions_command_id_unique").on(table.commandId),
  ],
);

export const inventoryTransactionItems = pgTable(
  "inventory_transaction_items",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id").notNull(),
    bookId: text("book_id").notNull(),
    semester: text("semester").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("inventory_transaction_items_semester_check", sql`${table.semester} IN ('first', 'second')`),
    check("inventory_transaction_items_quantity_after_nonnegative", sql`${table.quantityAfter} >= 0`),
  ],
);

export const syncOutbox = pgTable("sync_outbox", {
  id: text("id").primaryKey(),
  commandType: text("command_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const syncState = pgTable("sync_state", {
  id: text("id").primaryKey(),
  pullCursor: text("pull_cursor"),
  lastSyncedAt: text("last_synced_at"),
  lastError: text("last_error"),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const syncChanges = pgTable(
  "sync_changes",
  {
    sequence: bigserial("sequence", { mode: "number" }).primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    commandId: text("command_id").notNull(),
    entityTable: text("entity_table").notNull(),
    entityId: text("entity_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("sync_changes_scope_command_entity_unique").on(
      table.scopeId,
      table.commandId,
      table.entityTable,
      table.entityId,
    ),
  ],
);

export const appliedSyncCommands = pgTable("applied_sync_commands", {
  commandId: text("command_id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull(),
  reasonCode: text("reason_code"),
  message: text("message"),
  appliedAt: text("applied_at").notNull(),
});
