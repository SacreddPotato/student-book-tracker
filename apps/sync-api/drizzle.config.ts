import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const syncApiDirectory = dirname(fileURLToPath(import.meta.url));

loadEnv({ path: resolve(syncApiDirectory, ".env"), quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://placeholder:placeholder@localhost:5432/student_book_tracker",
  },
});
