import { readFile } from "node:fs/promises";

import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  appSettings,
  academicYears,
  books,
  inventoryTransactionItems,
  inventoryTransactions,
  requiredRemoteTableNames,
  students,
  studentBooks,
  syncChanges,
  syncOutbox,
  syncState,
} from "../src/db/schema";
import { readSyncApiEnv } from "../src/env";

describe("remote database schema", () => {
  it("clears placeholder data before required columns and removes legacy quantity", async () => {
    const semesterMigration = await readFile(
      new URL("../drizzle/0001_semester_inventory_academic_years.sql", import.meta.url),
      "utf8",
    );
    const dropMigration = await readFile(
      new URL("../drizzle/0002_drop_legacy_book_quantity.sql", import.meta.url),
      "utf8",
    );

    expect(semesterMigration.indexOf("TRUNCATE TABLE")).toBeLessThan(
      semesterMigration.indexOf('ADD COLUMN "academic_year"'),
    );
    expect(semesterMigration).toContain('"sync_changes"');
    expect(dropMigration).toContain('DROP COLUMN "quantity"');
  });

  it("keeps the canonical local tables and adds a remote change cursor", () => {
    expect(requiredRemoteTableNames).toEqual([
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
    ]);

    expect(getTableName(academicYears)).toBe("academic_years");
    expect(getTableName(students)).toBe("students");
    expect(getTableName(books)).toBe("books");
    expect(getTableName(studentBooks)).toBe("student_books");
    expect(getTableName(inventoryTransactions)).toBe("inventory_transactions");
    expect(getTableName(inventoryTransactionItems)).toBe(
      "inventory_transaction_items",
    );
    expect(getTableName(syncOutbox)).toBe("sync_outbox");
    expect(getTableName(syncState)).toBe("sync_state");
    expect(getTableName(appSettings)).toBe("app_settings");
    expect(getTableName(syncChanges)).toBe("sync_changes");
  });

  it("uses column names that match the local SQLite contract", () => {
    expect(students.governmentId.name).toBe("government_id");
    expect(students.educationStage.name).toBe("education_stage");
    expect(students.gradeLevel.name).toBe("grade_level");
    expect(books.educationStage.name).toBe("education_stage");
    expect(books.firstSemesterQuantity.name).toBe("first_semester_quantity");
    expect(books.secondSemesterQuantity.name).toBe("second_semester_quantity");
    expect(students.academicYear.name).toBe("academic_year");
    expect(students.previousStudentId.name).toBe("previous_student_id");
    expect(studentBooks.academicYear.name).toBe("academic_year");
    expect(studentBooks.semester.name).toBe("semester");
    expect(studentBooks.issuedTransactionId.name).toBe(
      "issued_transaction_id",
    );
    expect(inventoryTransactions.reversedTransactionId.name).toBe(
      "reversed_transaction_id",
    );
    expect(inventoryTransactions.reversedByTransactionId.name).toBe(
      "reversed_by_transaction_id",
    );
    expect(inventoryTransactions.commandId.name).toBe("command_id");
    expect(inventoryTransactions.academicYear.name).toBe("academic_year");
    expect(inventoryTransactions.receiptNumber.name).toBe("receipt_number");
    expect(inventoryTransactions.receiptDate.name).toBe("receipt_date");
    expect(inventoryTransactionItems.semester.name).toBe("semester");
    expect(inventoryTransactionItems.quantityDelta.name).toBe(
      "quantity_delta",
    );
    expect(inventoryTransactionItems.quantityAfter.name).toBe(
      "quantity_after",
    );
    expect(syncOutbox.payloadJson.name).toBe("payload_json");
    expect(syncState.pullCursor.name).toBe("pull_cursor");
    expect(appSettings.valueJson.name).toBe("value_json");
    expect(syncChanges.sequence.name).toBe("sequence");
    expect(syncChanges.payloadJson.name).toBe("payload_json");
  });
});

describe("sync api environment", () => {
  it("explains where local testing and production Neon URLs belong", () => {
    expect(() => readSyncApiEnv({})).toThrow(
      /apps\/sync-api\/\.env[\s\S]*GitHub environment secret[\s\S]*DATABASE_URL/,
    );
  });

  it("reads the required connection and shared secret settings", () => {
    expect(
      readSyncApiEnv({
        DATABASE_URL: "postgresql://testing.example.neon.tech/app",
        SYNC_API_SHARED_SECRET: "local-secret",
        NODE_ENV: "production",
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://testing.example.neon.tech/app",
      SYNC_API_SHARED_SECRET: "local-secret",
      NODE_ENV: "production",
    });
  });

  it("documents env placeholders without committing real Neon URLs", async () => {
    const example = await readFile(new URL("../.env.example", import.meta.url), {
      encoding: "utf8",
    });

    expect(example).toContain("DATABASE_URL=");
    expect(example).toContain("SYNC_API_SHARED_SECRET=");
    expect(example).toContain("NODE_ENV=development");
    expect(example).toContain("Neon testing branch");
    expect(example).toContain("GitHub environment secret");
    expect(example).not.toContain("neon.tech/");
  });
});
