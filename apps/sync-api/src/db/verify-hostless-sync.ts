import postgres from "postgres";

import {
  databaseFingerprint,
  syncClientRoleName,
} from "./sync-role";

const ownerDatabaseUrl = process.env.DATABASE_URL;
const restrictedDatabaseUrl = process.env.NEON_SYNC_DATABASE_URL;
if (!ownerDatabaseUrl) throw new Error("DATABASE_URL is required.");
if (!restrictedDatabaseUrl) throw new Error("NEON_SYNC_DATABASE_URL is required.");

const ownerTarget = parseTarget(ownerDatabaseUrl);
const restrictedTarget = parseTarget(restrictedDatabaseUrl);
if (ownerTarget.username === syncClientRoleName
  || restrictedTarget.username !== syncClientRoleName
  || ownerTarget.database !== restrictedTarget.database
  || normaliseNeonHost(ownerTarget.host) !== normaliseNeonHost(restrictedTarget.host)) {
  throw new Error("Owner and restricted URLs must target the same Neon branch with different roles.");
}
const expectedFingerprint = process.env.EXPECTED_DATABASE_FINGERPRINT?.trim();
const ownerFingerprint = databaseFingerprint(ownerDatabaseUrl);
if (expectedFingerprint && ownerFingerprint !== expectedFingerprint) {
  throw new Error("Database fingerprint does not match the protected expected target.");
}

const ownerSql = postgres(ownerDatabaseUrl, { max: 1 });
const restrictedSql = postgres(restrictedDatabaseUrl, { max: 1 });
let stage = "inspect-owner";
try {
  const [migration] = await ownerSql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
  `;
  const functions = await ownerSql<{
    signature: string;
    owner: string;
    securityDefiner: boolean;
    publicExecutable: boolean;
    clientExecutable: boolean;
  }[]>`
    SELECT
      p.oid::regprocedure::text AS signature,
      pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef AS "securityDefiner",
      has_function_privilege('public', p.oid, 'EXECUTE') AS "publicExecutable",
      has_function_privilege(${syncClientRoleName}, p.oid, 'EXECUTE') AS "clientExecutable"
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'sync_api' AND p.proname IN ('sync_push', 'sync_pull')
    ORDER BY p.proname
  `;
  const [role] = await ownerSql<{
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
  const [directPrivileges] = await ownerSql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM information_schema.role_table_grants
    WHERE grantee = ${syncClientRoleName}
  `;
  const [cutover] = await ownerSql<{ rows: number }[]>`
    SELECT (
      (SELECT count(*) FROM academic_years)
      + (SELECT count(*) FROM students)
      + (SELECT count(*) FROM books)
      + (SELECT count(*) FROM student_books)
      + (SELECT count(*) FROM inventory_transactions)
      + (SELECT count(*) FROM inventory_transaction_items)
      + (SELECT count(*) FROM sync_changes)
      + (SELECT count(*) FROM applied_sync_commands)
    )::int AS rows
  `;

  const expectedFunctions = [
    "sync_api.sync_pull(bigint)",
    "sync_api.sync_push(jsonb)",
  ];
  const functionsValid = functions.length === 2
    && functions.every((entry, index) =>
      entry.signature === expectedFunctions[index]
      && entry.owner === "student_book_sync_runtime"
      && entry.securityDefiner
      && !entry.publicExecutable
      && entry.clientExecutable);
  const roleSafe = role
    && !role.superuser
    && !role.createDatabase
    && !role.createRole
    && !role.inherit
    && role.login
    && !role.replication
    && !role.bypassRls;
  if (migration?.count !== 5
    || !functionsValid
    || !roleSafe
    || directPrivileges?.count !== 0
    || (process.env.REQUIRE_EMPTY_SYNC_TARGET === "1" && cutover?.rows !== 0)) {
    throw new Error("Owner-side hostless contract is invalid.");
  }

  stage = "exercise-restricted-role";
  const [pull] = await restrictedSql<{
    payload: { changes: unknown[]; nextCursor: string };
  }[]>`SELECT sync_api.sync_pull(0::bigint) AS payload`;
  const probe = [{
    id: "__hostless_verifier_probe__",
    type: "UNKNOWN_PROBE",
    deviceId: "hostless-verifier",
    occurredAt: "2026-07-13T00:00:00.000Z",
  }];
  const [push] = await restrictedSql<{
    payload: { results: Array<{ commandId: string; status: string }> };
  }[]>`
    SELECT sync_api.sync_push(${restrictedSql.json(probe)}::jsonb) AS payload
  `;
  const deniedChecks: string[] = [];
  for (const [name, operation] of [
    ["select-table", () => restrictedSql`SELECT * FROM books LIMIT 1`],
    ["private-function", () =>
      restrictedSql`SELECT sync_private.valid_academic_year('2025-2026')`],
    ["create-schema", () => restrictedSql`CREATE SCHEMA hostless_verifier_probe`],
  ] as const) {
    try {
      await operation();
    } catch (error) {
      if (isInsufficientPrivilege(error)) {
        deniedChecks.push(name);
        continue;
      }
      throw error;
    }
    throw new Error(`Restricted role unexpectedly passed ${name}.`);
  }
  if (!Array.isArray(pull?.payload?.changes)
    || typeof pull?.payload?.nextCursor !== "string"
    || push?.payload?.results?.[0]?.commandId !== "__hostless_verifier_probe__"
    || deniedChecks.length !== 3) {
    throw new Error("Restricted push/pull contract is invalid.");
  }

  stage = "remove-verification-probe";
  await ownerSql`
    DELETE FROM applied_sync_commands
    WHERE command_id = '__hostless_verifier_probe__'
  `;

  console.log(JSON.stringify({
    ownerFingerprint,
    restrictedFingerprint: databaseFingerprint(restrictedDatabaseUrl),
    migrations: migration.count,
    roleName: syncClientRoleName,
    functions: functions.map(({ signature, owner }) => ({ signature, owner })),
    cutoverRows: cutover.rows,
    deniedChecks,
  }));
} catch {
  throw new Error(`Hostless sync verification failed at ${stage}.`);
} finally {
  await Promise.all([
    ownerSql.end({ timeout: 5 }),
    restrictedSql.end({ timeout: 5 }),
  ]);
}

function parseTarget(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    if (!parsed.username || !parsed.hostname || parsed.pathname.length <= 1) throw new Error();
    return {
      username: decodeURIComponent(parsed.username),
      host: parsed.hostname.toLowerCase(),
      database: decodeURIComponent(parsed.pathname.slice(1)),
    };
  } catch {
    throw new Error("Hostless sync database URL is malformed.");
  }
}

function normaliseNeonHost(host: string) {
  return host.replace(/-pooler(?=\.)/, "");
}

function isInsufficientPrivilege(error: unknown) {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "42501";
}
