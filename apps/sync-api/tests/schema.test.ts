import { readFile } from "node:fs/promises";

import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  appSettings,
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
  it("keeps the canonical local tables and adds a remote change cursor", () => {
    expect(requiredRemoteTableNames).toEqual([
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
    expect(books.quantity.name).toBe("quantity");
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
