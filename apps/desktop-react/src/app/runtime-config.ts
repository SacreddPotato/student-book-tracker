export type DesktopProfile = "preview" | "production";

export type RuntimeConfig = {
  profile: DesktopProfile;
  databaseUrl: string;
  databaseFile: string;
  neonSyncDatabaseUrl: string | null;
  updaterEnabled: boolean;
};

export function resolveRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  const rawProfile = env.VITE_DESKTOP_PROFILE ?? "preview";

  if (rawProfile !== "preview" && rawProfile !== "production") {
    throw new Error(`Unknown desktop profile: ${String(rawProfile)}`);
  }

  const production = rawProfile === "production";
  const configuredNeonSyncDatabaseUrl = env.VITE_NEON_SYNC_DATABASE_URL == null
    ? ""
    : String(env.VITE_NEON_SYNC_DATABASE_URL).trim();
  const neonSyncDatabaseUrl = configuredNeonSyncDatabaseUrl
    ? validateRestrictedNeonUrl(configuredNeonSyncDatabaseUrl)
    : null;

  const databaseFile = production
    ? "student-book-tracker.db"
    : "student-book-tracker-react.db";

  return {
    profile: rawProfile,
    databaseFile,
    databaseUrl: `sqlite:${databaseFile}`,
    neonSyncDatabaseUrl,
    updaterEnabled: production,
  };
}

function validateRestrictedNeonUrl(value: string): string {
  try {
    const url = new URL(value);
    const protocolValid = url.protocol === "postgres:" || url.protocol === "postgresql:";
    const host = url.hostname.toLowerCase();
    const endpoint = host.split(".")[0] ?? "";
    const username = decodeURIComponent(url.username);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

    if (!protocolValid
      || !host.endsWith(".neon.tech")
      || !endpoint.endsWith("-pooler")
      || username !== "student_book_sync_client"
      || url.password.length === 0
      || database.length === 0) {
      throw new Error("invalid");
    }

    return value;
  } catch {
    throw new Error(
      "Neon sync database URL must use the restricted student_book_sync_client role and a pooled Neon endpoint.",
    );
  }
}
