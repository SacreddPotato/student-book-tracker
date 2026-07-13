import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import "../env";
import {
  buildRestrictedDatabaseUrl,
  provisionSyncRole,
} from "./sync-role";

const ownerDatabaseUrl = process.env.DATABASE_URL;
const password = process.env.NEON_SYNC_ROLE_PASSWORD;
if (!ownerDatabaseUrl) throw new Error("DATABASE_URL is required.");
if (!password) throw new Error("NEON_SYNC_ROLE_PASSWORD is required.");

const allowNonNeonHost = process.env.NODE_ENV === "test";
const report = await provisionSyncRole({
  ownerDatabaseUrl,
  password,
  allowNonNeonHost,
});

const outputPath = process.env.NEON_SYNC_URL_OUTPUT?.trim();
if (outputPath) {
  if (allowNonNeonHost) {
    throw new Error("NEON_SYNC_URL_OUTPUT is available only for Neon targets.");
  }
  const restrictedUrl = buildRestrictedDatabaseUrl(ownerDatabaseUrl, password);
  await writeFile(resolve(outputPath), `${restrictedUrl}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

console.log(JSON.stringify({
  ...report,
  restrictedUrlWritten: Boolean(outputPath),
}));

