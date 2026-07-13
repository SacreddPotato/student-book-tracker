import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  buildRestrictedDatabaseUrl,
  databaseFingerprint,
  provisionSyncRole,
  redactDatabaseUrl,
  syncClientRoleName,
} from "../src/db/sync-role";

const ownerDatabaseUrl = process.env.HOSTLESS_TEST_DATABASE_URL;
const rolePassword = process.env.NEON_SYNC_ROLE_PASSWORD;
const describeWithPostgres = ownerDatabaseUrl && rolePassword ? describe : describe.skip;

describe("restricted sync role helpers", () => {
  const ownerUrl =
    "postgresql://neondb_owner:owner-secret@ep-green-tree-123.us-east-2.aws.neon.tech/neondb"
    + "?sslmode=require&channel_binding=require";

  it("builds a pooled URL for only the fixed client role", () => {
    const result = buildRestrictedDatabaseUrl(ownerUrl, "client p@ss");

    expect(result).toBe(
      "postgresql://student_book_sync_client:client%20p%40ss"
      + "@ep-green-tree-123-pooler.us-east-2.aws.neon.tech/neondb"
      + "?sslmode=require&channel_binding=require",
    );
    expect(new URL(result).username).toBe(syncClientRoleName);
  });

  it("redacts credentials and fingerprints only the target", () => {
    const restricted = buildRestrictedDatabaseUrl(ownerUrl, "client-secret");

    expect(redactDatabaseUrl(restricted)).toBe(
      "postgresql://student_book_sync_client:***"
      + "@ep-green-tree-123-pooler.us-east-2.aws.neon.tech/neondb",
    );
    expect(databaseFingerprint(ownerUrl)).toMatch(/^[a-f0-9]{12}$/);
    expect(databaseFingerprint(restricted)).not.toBe(databaseFingerprint(ownerUrl));
    expect(redactDatabaseUrl(restricted)).not.toContain("client-secret");
  });

  it("rejects a pooled owner URL and an empty password", () => {
    expect(() => buildRestrictedDatabaseUrl(
      ownerUrl.replace(".us-east-2", "-pooler.us-east-2"),
      "client-secret",
    )).toThrow("direct owner");
    expect(() => buildRestrictedDatabaseUrl(ownerUrl, "")).toThrow("password");
  });

  it("exposes a redacted provisioning CLI and documents secret placement", async () => {
    const packageJson = JSON.parse(await readFile(
      new URL("../package.json", import.meta.url),
      "utf8",
    )) as { scripts: Record<string, string> };
    const envExample = await readFile(
      new URL("../.env.example", import.meta.url),
      "utf8",
    );
    const runbook = await readFile(
      new URL("../../../docs/runbooks/database-migrations.md", import.meta.url),
      "utf8",
    );
    const implementation = await readFile(
      new URL("../src/db/sync-role.ts", import.meta.url),
      "utf8",
    );

    expect(packageJson.scripts["db:provision-sync-role"])
      .toBe("tsx src/db/provision-sync-role.ts");
    expect(envExample).toContain("NEON_SYNC_ROLE_PASSWORD=");
    expect(envExample).toContain("NEON_SYNC_URL_OUTPUT=");
    expect(runbook).toContain("student_book_sync_client");
    expect(runbook).toContain("NEON_SYNC_DATABASE_URL");
    expect(runbook).toContain("extractable");
    expect(implementation).toContain("FROM pg_auth_members");
    expect(implementation).toContain("IF EXISTS");
  });
});

describeWithPostgres("restricted sync role privileges", () => {
  const ownerSql = postgres(ownerDatabaseUrl!, { max: 4 });
  let restrictedUrl = "";

  beforeAll(async () => {
    await migrate(drizzle(ownerSql), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    const report = await provisionSyncRole({
      ownerDatabaseUrl: ownerDatabaseUrl!,
      password: rolePassword!,
      allowNonNeonHost: true,
    });
    const parsedRestrictedUrl = new URL(ownerDatabaseUrl!);
    parsedRestrictedUrl.username = syncClientRoleName;
    parsedRestrictedUrl.password = rolePassword!;
    restrictedUrl = parsedRestrictedUrl.toString();
    expect(report).toMatchObject({
      roleName: "student_book_sync_client",
      pushCallable: true,
      pullCallable: true,
    });
    expect(report.deniedChecks.sort()).toEqual([
      "create-role",
      "create-schema",
      "delete-table",
      "insert-table",
      "private-function",
      "select-table",
      "update-table",
    ]);
    expect(JSON.stringify(report)).not.toContain(rolePassword);
  });

  afterAll(async () => {
    await ownerSql.end({ timeout: 5 });
  });

  it("has no direct database privileges or runtime-role membership", async () => {
    const sql = postgres(restrictedUrl, { max: 1 });
    try {
      const [membership] = await ownerSql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM pg_auth_members membership
        JOIN pg_roles member_role ON member_role.oid = membership.member
        JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
        WHERE member_role.rolname = ${syncClientRoleName}
          AND granted_role.rolname = 'student_book_sync_runtime'
      `;
      expect(membership.count).toBe(0);
      await expect(sql`SELECT sync_api.sync_pull(0::bigint) AS payload`)
        .resolves.toHaveLength(1);
      await expect(sql`SELECT * FROM books`).rejects.toThrow(/permission denied/i);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
