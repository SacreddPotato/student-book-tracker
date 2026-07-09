import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const syncApiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

loadEnv({ path: resolve(syncApiDirectory, ".env"), quiet: true });

export type SyncApiNodeEnv = "development" | "test" | "production";

export type SyncApiEnv = {
  DATABASE_URL: string;
  SYNC_API_SHARED_SECRET: string;
  NODE_ENV: SyncApiNodeEnv;
};

type EnvSource = Partial<Record<string, string | undefined>>;

const allowedNodeEnvs = new Set(["development", "test", "production"]);

export function getNeonUrlPlacementGuidance(): string {
  return [
    "For local Segment 10 work, put the Neon dev/testing branch URL in apps/sync-api/.env as DATABASE_URL.",
    "For deployed production or CI deploys, put the Neon production branch URL in a GitHub environment secret or hosting provider environment variable named DATABASE_URL.",
    "Keep SYNC_API_SHARED_SECRET beside DATABASE_URL in the same local .env file or secret store.",
    "Do not commit real Neon URLs or sync secrets.",
  ].join("\n");
}

export function readSyncApiEnv(source: EnvSource = process.env): SyncApiEnv {
  const missing = ["DATABASE_URL", "SYNC_API_SHARED_SECRET"].filter(
    (key) => !source[key],
  );

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing sync API environment variable(s): ${missing.join(", ")}.`,
        getNeonUrlPlacementGuidance(),
      ].join("\n"),
    );
  }

  const nodeEnv = source.NODE_ENV ?? "development";

  if (!allowedNodeEnvs.has(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of development, test, production. Received: ${nodeEnv}`,
    );
  }

  return {
    DATABASE_URL: source.DATABASE_URL as string,
    SYNC_API_SHARED_SECRET: source.SYNC_API_SHARED_SECRET as string,
    NODE_ENV: nodeEnv as SyncApiNodeEnv,
  };
}
