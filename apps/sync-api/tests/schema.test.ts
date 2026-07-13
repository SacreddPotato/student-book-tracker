import { readFile } from "node:fs/promises";

import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  appliedSyncCommands,
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
  it("installs the restricted hostless sync contract", async () => {
    const migration = await readFile(
      new URL("../drizzle/0004_hostless_direct_neon_sync.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS sync_api");
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS sync_private");
    expect(migration).toContain("CREATE ROLE student_book_sync_runtime NOLOGIN");
    expect(migration).toContain("FUNCTION sync_api.sync_push(p_commands jsonb)");
    expect(migration).toContain("FUNCTION sync_api.sync_pull(p_since bigint)");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public, sync_private");
    expect(migration).toContain(
      "GRANT USAGE, CREATE ON SCHEMA sync_api, sync_private\nTO student_book_sync_runtime",
    );
    expect(migration).toContain(
      "REVOKE CREATE ON SCHEMA sync_api, sync_private\nFROM student_book_sync_runtime",
    );
    expect(migration).not.toContain("REVOKE student_book_sync_runtime FROM %I");
    expect(migration).toContain("REVOKE ALL ON FUNCTION sync_api.sync_push(jsonb) FROM PUBLIC");
    expect(migration).toContain("REVOKE ALL ON FUNCTION sync_api.sync_pull(bigint) FROM PUBLIC");
    for (const commandType of [
      "INITIALIZE_ACADEMIC_YEAR",
      "ADVANCE_ACADEMIC_YEAR",
      "UPSERT_STUDENT",
      "UPSERT_BOOK",
      "DELETE_STUDENT",
      "DELETE_BOOK",
      "ADD_BOOK_STOCK",
      "ISSUE_BOOKS_TO_STUDENT",
      "REVERSE_TRANSACTION",
    ]) {
      expect(migration).toContain(`'${commandType}'`);
    }
  });

  it("verifies the hostless migration count, functions, owner, and grants", async () => {
    const verifier = await readFile(
      new URL("../src/db/verify-migration.ts", import.meta.url),
      "utf8",
    );

    expect(verifier).toContain("migration?.count !== 5");
    expect(verifier).toContain("sync_api.sync_push(jsonb)");
    expect(verifier).toContain("sync_api.sync_pull(bigint)");
    expect(verifier).toContain("student_book_sync_runtime");
    expect(verifier).toContain("applied_sync_commands");
  });

  it("requires secret-backed production targeting and redacted hostless verification", async () => {
    const workflow = await readFile(
      new URL("../../../.github/workflows/migrate-production.yml", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(await readFile(
      new URL("../package.json", import.meta.url),
      "utf8",
    )) as { scripts: Record<string, string> };
    const hostlessVerifier = await readFile(
      new URL("../src/db/verify-hostless-sync.ts", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain(
      "EXPECTED_DATABASE_FINGERPRINT: ${{ secrets.EXPECTED_DATABASE_FINGERPRINT }}",
    );
    expect(workflow).not.toContain("EXPECTED_DATABASE_FINGERPRINT: 8479f751bcff");
    expect(packageJson.scripts["db:verify-hostless"])
      .toBe("tsx src/db/verify-hostless-sync.ts");
    expect(hostlessVerifier).toContain("NEON_SYNC_DATABASE_URL");
    expect(hostlessVerifier).toContain("syncClientRoleName");
    expect(hostlessVerifier).not.toContain("console.log(databaseUrl)");
  });

  it("migrates existing books to required deterministic grade scope", async () => {
    const gradeMigration = await readFile(
      new URL("../drizzle/0003_grade_scoped_books.sql", import.meta.url),
      "utf8",
    );

    expect(gradeMigration).toContain('ADD COLUMN "grade_level" text');
    expect(gradeMigration).toContain("WHEN 'kg' THEN 'kg1'");
    expect(gradeMigration).toContain("WHEN 'primary' THEN 'primary1'");
    expect(gradeMigration).toContain("ELSE 'preparatory1'");
    expect(gradeMigration).toContain('ALTER COLUMN "grade_level" SET NOT NULL');
    expect(gradeMigration).toContain('DROP INDEX "books_scope_stage_name_unique"');
    expect(gradeMigration).toContain('CREATE UNIQUE INDEX "books_scope_grade_name_unique"');
  });

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
      "applied_sync_commands",
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
    expect(getTableName(appliedSyncCommands)).toBe("applied_sync_commands");
  });

  it("uses column names that match the local SQLite contract", () => {
    expect(students.governmentId.name).toBe("government_id");
    expect(students.educationStage.name).toBe("education_stage");
    expect(students.gradeLevel.name).toBe("grade_level");
    expect(books.educationStage.name).toBe("education_stage");
    expect(books.gradeLevel.name).toBe("grade_level");
    expect(books.gradeLevel.notNull).toBe(true);
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
    expect(appliedSyncCommands.payloadHash.name).toBe("payload_hash");
    expect(appliedSyncCommands.reasonCode.name).toBe("reason_code");
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
