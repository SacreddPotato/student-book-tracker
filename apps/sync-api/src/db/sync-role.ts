import { createHash } from "node:crypto";

import postgres from "postgres";

export const syncClientRoleName = "student_book_sync_client" as const;

export type ProvisioningReport = {
  ownerFingerprint: string;
  restrictedFingerprint: string;
  roleName: typeof syncClientRoleName;
  pushCallable: boolean;
  pullCallable: boolean;
  deniedChecks: string[];
};

export type ProvisionSyncRoleOptions = {
  ownerDatabaseUrl: string;
  password: string;
  allowNonNeonHost?: boolean;
};

export function buildRestrictedDatabaseUrl(
  ownerDatabaseUrl: string,
  password: string,
): string {
  if (!password) throw new Error("A non-empty restricted role password is required.");

  const parsed = parseDatabaseUrl(ownerDatabaseUrl);
  if (!parsed.hostname.endsWith(".neon.tech")) {
    throw new Error("The owner database URL must target Neon.");
  }
  const labels = parsed.hostname.split(".");
  if (labels[0]?.endsWith("-pooler")) {
    throw new Error("Provisioning requires a direct owner database URL.");
  }
  if (!labels[0]) throw new Error("The owner database URL hostname is invalid.");

  labels[0] = `${labels[0]}-pooler`;
  parsed.hostname = labels.join(".");
  parsed.username = syncClientRoleName;
  parsed.password = password;
  return parsed.toString();
}

export function redactDatabaseUrl(databaseUrl: string): string {
  const parsed = parseDatabaseUrl(databaseUrl);
  parsed.password = "***";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function databaseFingerprint(databaseUrl: string): string {
  const parsed = parseDatabaseUrl(databaseUrl);
  return createHash("sha256")
    .update(`${parsed.hostname}${parsed.pathname}`)
    .digest("hex")
    .slice(0, 12);
}

export async function provisionSyncRole(
  options: ProvisionSyncRoleOptions,
): Promise<ProvisioningReport> {
  if (!options.password) {
    throw new Error("NEON_SYNC_ROLE_PASSWORD must be non-empty.");
  }
  const ownerUrl = parseDatabaseUrl(options.ownerDatabaseUrl);
  const isNeon = ownerUrl.hostname.endsWith(".neon.tech");
  if (!isNeon && !options.allowNonNeonHost) {
    throw new Error("The owner database URL must target Neon.");
  }

  const ownerSql = postgres(options.ownerDatabaseUrl, { max: 1 });
  const restrictedUrl = isNeon
    ? buildRestrictedDatabaseUrl(options.ownerDatabaseUrl, options.password)
    : replaceCredentials(options.ownerDatabaseUrl, options.password);
  let stage = "read-database";
  try {
    const [{ databaseName }] = await ownerSql<{ databaseName: string }[]>`
      SELECT current_database() AS "databaseName"
    `;
    const quotedDatabase = quoteIdentifier(databaseName);

    await ownerSql.begin(async (transaction) => {
      stage = "quote-password";
      const [{ passwordLiteral }] = await transaction<{ passwordLiteral: string }[]>`
        SELECT quote_literal(${options.password}) AS "passwordLiteral"
      `;

      stage = "create-client-role";
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(${syncClientRoleName}, 0))
      `;
      const [{ roleExists }] = await transaction<{ roleExists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = ${syncClientRoleName}
        ) AS "roleExists"
      `;
      if (!roleExists) {
        await transaction.unsafe(`
          CREATE ROLE ${syncClientRoleName}
            LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
        `);
      }
      stage = "alter-client-role";
      await transaction.unsafe(`
        ALTER ROLE ${syncClientRoleName}
          WITH LOGIN NOCREATEROLE NOINHERIT
          PASSWORD ${passwordLiteral}
      `);
      stage = "verify-client-role-attributes";
      const [attributes] = await transaction<{
        superuser: boolean;
        createDatabase: boolean;
        createRole: boolean;
        inherit: boolean;
        login: boolean;
        replication: boolean;
        bypassRls: boolean;
      }[]>`
        SELECT
          rolsuper AS superuser,
          rolcreatedb AS "createDatabase",
          rolcreaterole AS "createRole",
          rolinherit AS inherit,
          rolcanlogin AS login,
          rolreplication AS replication,
          rolbypassrls AS "bypassRls"
        FROM pg_roles
        WHERE rolname = ${syncClientRoleName}
      `;
      if (!attributes
        || attributes.superuser
        || attributes.createDatabase
        || attributes.createRole
        || attributes.inherit
        || !attributes.login
        || attributes.replication
        || attributes.bypassRls) {
        throw new Error("Restricted client role attributes are unsafe.");
      }
      stage = "revoke-runtime-membership";
      await transaction.unsafe(`
        DO $membership$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_auth_members membership
            JOIN pg_roles member_role ON member_role.oid = membership.member
            JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
            WHERE member_role.rolname = '${syncClientRoleName}'
              AND granted_role.rolname = 'student_book_sync_runtime'
          ) THEN
            EXECUTE 'REVOKE student_book_sync_runtime FROM ${syncClientRoleName}';
          END IF;
        END
        $membership$
      `);
      stage = "revoke-table-privileges";
      await transaction.unsafe(`
        REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
        FROM ${syncClientRoleName}
      `);
      stage = "revoke-sequence-privileges";
      await transaction.unsafe(`
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
        FROM ${syncClientRoleName}
      `);
      stage = "revoke-private-function-privileges";
      await transaction.unsafe(`
        REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA sync_private
        FROM ${syncClientRoleName}
      `);
      stage = "revoke-api-function-privileges";
      await transaction.unsafe(`
        REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA sync_api
        FROM ${syncClientRoleName}
      `);
      stage = "revoke-schema-privileges";
      await transaction.unsafe(`
        REVOKE ALL PRIVILEGES ON SCHEMA public, sync_private, sync_api
        FROM ${syncClientRoleName}
      `);
      stage = "revoke-database-create";
      await transaction.unsafe(`
        REVOKE CREATE ON DATABASE ${quotedDatabase}
        FROM ${syncClientRoleName}
      `);
      stage = "grant-database-connect";
      await transaction.unsafe(`
        GRANT CONNECT ON DATABASE ${quotedDatabase}
        TO ${syncClientRoleName}
      `);
      stage = "grant-api-schema-usage";
      await transaction.unsafe(`
        GRANT USAGE ON SCHEMA sync_api
        TO ${syncClientRoleName}
      `);
      stage = "grant-push-execute";
      await transaction.unsafe(`
        GRANT EXECUTE ON FUNCTION sync_api.sync_push(jsonb)
        TO ${syncClientRoleName}
      `);
      stage = "grant-pull-execute";
      await transaction.unsafe(`
        GRANT EXECUTE ON FUNCTION sync_api.sync_pull(bigint)
        TO ${syncClientRoleName}
      `);
    });

    stage = "verify-restricted-role";
    const verification = await verifyRestrictedRole(restrictedUrl);
    stage = "remove-probe";
    await ownerSql`
      DELETE FROM applied_sync_commands
      WHERE command_id = '__sync_role_probe__'
    `;

    return {
      ownerFingerprint: databaseFingerprint(options.ownerDatabaseUrl),
      restrictedFingerprint: databaseFingerprint(restrictedUrl),
      roleName: syncClientRoleName,
      pushCallable: verification.pushCallable,
      pullCallable: verification.pullCallable,
      deniedChecks: verification.deniedChecks,
    };
  } catch {
    throw new Error(`Restricted sync role provisioning failed at ${stage}.`);
  } finally {
    await ownerSql.end({ timeout: 5 });
  }
}

function replaceCredentials(ownerDatabaseUrl: string, password: string) {
  const parsed = parseDatabaseUrl(ownerDatabaseUrl);
  parsed.username = syncClientRoleName;
  parsed.password = password;
  return parsed.toString();
}

async function verifyRestrictedRole(restrictedDatabaseUrl: string) {
  const sql = postgres(restrictedDatabaseUrl, { max: 1 });
  const deniedChecks: string[] = [];
  try {
    const [pull] = await sql<{ payload: { changes: unknown[]; nextCursor: string } }[]>`
      SELECT sync_api.sync_pull(0::bigint) AS payload
    `;
    const probe = [{
      id: "__sync_role_probe__",
      type: "UNKNOWN_PROBE",
      deviceId: "provisioning",
      occurredAt: "2026-07-13T00:00:00.000Z",
    }];
    const [push] = await sql<{
      payload: { results: Array<{ commandId: string; status: string }> };
    }[]>`
      SELECT sync_api.sync_push(${sql.json(probe)}::jsonb) AS payload
    `;

    const checks: Array<[string, () => Promise<unknown>]> = [
      ["select-table", () => sql`SELECT * FROM books LIMIT 1`],
      ["insert-table", () => sql`
        INSERT INTO books (
          id, scope_id, name, education_stage, grade_level,
          first_semester_quantity, second_semester_quantity,
          created_at, updated_at, deleted_at
        ) VALUES (
          '__probe__', 'global', 'Probe', 'primary', 'primary1',
          0, 0, '', '', NULL
        )
      `],
      ["update-table", () => sql`UPDATE books SET name = name`],
      ["delete-table", () => sql`DELETE FROM books WHERE false`],
      ["private-function", () =>
        sql`SELECT sync_private.valid_academic_year('2025-2026')`],
      ["create-schema", () => sql`CREATE SCHEMA sync_role_probe`],
      ["create-role", () => sql`CREATE ROLE sync_role_probe`],
    ];
    for (const [name, operation] of checks) {
      try {
        await operation();
      } catch (error) {
        if (isInsufficientPrivilege(error)) {
          deniedChecks.push(name);
          continue;
        }
        throw error;
      }
      throw new Error(`Restricted role unexpectedly passed check: ${name}`);
    }

    return {
      pullCallable: Array.isArray(pull?.payload?.changes)
        && typeof pull?.payload?.nextCursor === "string",
      pushCallable: push?.payload?.results?.[0]?.commandId === "__sync_role_probe__",
      deniedChecks,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function isInsufficientPrivilege(error: unknown) {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "42501";
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function parseDatabaseUrl(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Database URL is malformed.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || !parsed.hostname
    || !parsed.pathname
    || parsed.pathname === "/") {
    throw new Error("Database URL must be a PostgreSQL URL with a database name.");
  }
  return parsed;
}
