import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (context) =>
  context.json({
    ok: true,
    service: "student-book-tracker-sync-api",
  }),
);

const port = Number(process.env.PORT ?? 8787);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Sync API listening on http://localhost:${port}`);
