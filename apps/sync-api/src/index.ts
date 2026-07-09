import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { createDbClient } from "./db/client";
import { readSyncApiEnv } from "./env";
import { createHealthRoutes } from "./routes/health";
import { createSyncRoutes } from "./routes/sync";
import { DrizzleSyncChangeReader } from "./services/pull-changes";
import { DrizzleSyncStore } from "./services/sync-store";

const env = readSyncApiEnv();
const database = createDbClient(env);
const app = new Hono();

app.route("/", createHealthRoutes());
app.route(
  "/sync",
  createSyncRoutes({
    sharedSecret: env.SYNC_API_SHARED_SECRET,
    store: new DrizzleSyncStore(database),
    changeReader: new DrizzleSyncChangeReader(database),
  }),
);

const port = Number(process.env.PORT ?? 8787);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Sync API listening on http://localhost:${port}`);
