import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { readSyncApiEnv, type SyncApiEnv } from "../env";
import * as schema from "./schema";

export function createDbClient(env: SyncApiEnv = readSyncApiEnv()) {
  const sql = neon(env.DATABASE_URL);

  return drizzle(sql, { schema });
}

export type SyncDatabase = ReturnType<typeof createDbClient>;
