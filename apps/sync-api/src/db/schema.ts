import { sql } from "drizzle-orm";
import {
  bigserial,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const requiredRemoteTableNames = [
  "students",
  "books",
  "student_books",
  "inventory_transactions",
  "inventory_transaction_items",
  "sync_outbox",
  "sync_state",
  "app_settings",
  "sync_changes",
] as const;

export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    name: text("name").notNull(),
    governmentId: text("government_id").notNull(),
    educationStage: text("education_stage").notNull(),
    gradeLevel: text("grade_level").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("students_scope_government_id_unique")
      .on(table.scopeId, table.governmentId)
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
    quantity: integer("quantity").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("books_scope_stage_name_unique")
      .on(table.scopeId, table.educationStage, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const studentBooks = pgTable(
  "student_books",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    studentId: text("student_id").notNull(),
    bookId: text("book_id").notNull(),
    issuedTransactionId: text("issued_transaction_id").notNull(),
    createdAt: text("created_at").notNull(),
    reversedAt: text("reversed_at"),
  },
  (table) => [
    unique("student_books_scope_student_book_transaction_unique").on(
      table.scopeId,
      table.studentId,
      table.bookId,
      table.issuedTransactionId,
    ),
  ],
);

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: text("id").primaryKey(),
    scopeId: text("scope_id").notNull().default("global"),
    type: text("type").notNull(),
    studentId: text("student_id"),
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
    quantityDelta: integer("quantity_delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    createdAt: text("created_at").notNull(),
  },
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
