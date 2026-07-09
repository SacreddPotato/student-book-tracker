import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { readSyncApiEnv, type SyncApiEnv } from "../env";
import * as schema from "./schema";

export function createDbClient(env: SyncApiEnv = readSyncApiEnv()) {
  const sql = postgres(env.DATABASE_URL, { max: 10 });

  return drizzle(sql, { schema });
}

export type SyncDatabase = ReturnType<typeof createDbClient>;
