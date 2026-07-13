import { createHash } from "node:crypto";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const parsed = new URL(databaseUrl);
const fingerprint = createHash("sha256")
  .update(`${parsed.hostname}${parsed.pathname}`)
  .digest("hex")
  .slice(0, 12);
const expectedFingerprint = process.env.EXPECTED_DATABASE_FINGERPRINT;
if (expectedFingerprint && fingerprint !== expectedFingerprint) {
  throw new Error(`Database fingerprint mismatch: expected ${expectedFingerprint}, received ${fingerprint}.`);
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const [migration] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
  `;
  const [column] = await sql<{ isNullable: string }[]>`
    SELECT is_nullable AS "isNullable"
    FROM information_schema.columns
    WHERE table_name = 'books' AND column_name = 'grade_level'
  `;
  const [index] = await sql<{ indexName: string }[]>`
    SELECT indexname AS "indexName"
    FROM pg_indexes
    WHERE tablename = 'books' AND indexname = 'books_scope_grade_name_unique'
  `;
  const functions = await sql<{
    signature: string;
    owner: string;
    securityDefiner: boolean;
    publicExecutable: boolean;
  }[]>`
    SELECT
      p.oid::regprocedure::text AS signature,
      pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef AS "securityDefiner",
      has_function_privilege('public', p.oid, 'EXECUTE') AS "publicExecutable"
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'sync_api' AND p.proname IN ('sync_push', 'sync_pull')
    ORDER BY p.proname
  `;
  const [appliedTable] = await sql<{ tableName: string }[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'applied_sync_commands'
  `;
  const [cutover] = await sql<{ rows: number }[]>`
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
  const functionContractValid = functions.length === 2
    && functions.every((entry, index) =>
      entry.signature === expectedFunctions[index]
      && entry.owner === "student_book_sync_runtime"
      && entry.securityDefiner
      && !entry.publicExecutable);

  if (migration?.count !== 5
    || column?.isNullable !== "NO"
    || !index
    || appliedTable?.tableName !== "applied_sync_commands"
    || !functionContractValid
    || cutover?.rows !== 0) {
    throw new Error("Hostless sync migration verification failed.");
  }

  console.log(JSON.stringify({
    fingerprint,
    migrations: migration.count,
    gradeLevelNullable: column.isNullable,
    index: index.indexName,
    functions: functions.map(({ signature, owner }) => ({ signature, owner })),
    cutoverRows: cutover.rows,
  }));
} finally {
  await sql.end();
}
