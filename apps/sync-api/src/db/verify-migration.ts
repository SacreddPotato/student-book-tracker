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

  if (migration?.count !== 4 || column?.isNullable !== "NO" || !index) {
    throw new Error("Grade-scoped book migration verification failed.");
  }

  console.log(JSON.stringify({
    fingerprint,
    migrations: migration.count,
    gradeLevelNullable: column.isNullable,
    index: index.indexName,
  }));
} finally {
  await sql.end();
}
