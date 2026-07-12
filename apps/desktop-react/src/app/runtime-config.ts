export type DesktopProfile = "preview" | "production";

export type RuntimeConfig = {
  profile: DesktopProfile;
  databaseUrl: string;
  databaseFile: string;
  syncApiBaseUrl: string | null;
  syncApiSharedSecret?: string;
  updaterEnabled: boolean;
};

export function resolveRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  const rawProfile = env.VITE_DESKTOP_PROFILE ?? "preview";

  if (rawProfile !== "preview" && rawProfile !== "production") {
    throw new Error(`Unknown desktop profile: ${String(rawProfile)}`);
  }

  const production = rawProfile === "production";
  const configuredSyncApiBaseUrl = env.VITE_SYNC_API_BASE_URL == null
    ? ""
    : String(env.VITE_SYNC_API_BASE_URL).trim();
  const syncApiBaseUrl = configuredSyncApiBaseUrl
    || (production ? null : "http://127.0.0.1:8787");

  if (syncApiBaseUrl && !/^https?:\/\//.test(syncApiBaseUrl)) {
    throw new Error("Sync API base URL must use HTTP or HTTPS.");
  }

  const databaseFile = production
    ? "student-book-tracker.db"
    : "student-book-tracker-react.db";

  return {
    profile: rawProfile,
    databaseFile,
    databaseUrl: `sqlite:${databaseFile}`,
    syncApiBaseUrl,
    syncApiSharedSecret: env.VITE_SYNC_API_SHARED_SECRET
      ? String(env.VITE_SYNC_API_SHARED_SECRET)
      : undefined,
    updaterEnabled: production,
  };
}
