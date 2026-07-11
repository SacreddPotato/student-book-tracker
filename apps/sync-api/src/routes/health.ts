import { Hono } from "hono";

export function createHealthRoutes(): Hono {
  const app = new Hono();

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "student-book-tracker-sync-api",
    }),
  );

  return app;
}
