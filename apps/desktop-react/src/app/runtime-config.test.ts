import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import productionTauri from "../../src-tauri/tauri.production.conf.json";
import previewTauri from "../../src-tauri/tauri.conf.json";
import { resolveRuntimeConfig } from "./runtime-config";

describe("resolveRuntimeConfig", () => {
  it("keeps the release workflow on the production React identity", () => {
    const releaseWorkflow = readFileSync(
      resolve(process.cwd(), "../../.github/workflows/release-windows.yml"),
      "utf8",
    );

    expect(releaseWorkflow).toContain("apps/desktop-react/package.json");
    expect(releaseWorkflow).toContain("projectPath: apps/desktop-react");
    expect(releaseWorkflow).toContain("tauri.production.conf.json");
    expect(productionTauri.identifier).toBe("com.studentbooktracker.app");
    expect(JSON.stringify(productionTauri)).toContain(
      "releases/latest/download/latest.json",
    );
  });

  it("isolates preview identity and database", () => {
    const config = resolveRuntimeConfig({ DEV: true, PROD: false });

    expect(config.profile).toBe("preview");
    expect(config.databaseUrl).toBe("sqlite:student-book-tracker-react.db");
    expect(config.updaterEnabled).toBe(false);
    expect(previewTauri.identifier).toBe("com.studentbooktracker.reactdev");
    expect(previewTauri.plugins.sql.preload).toEqual([
      "sqlite:student-book-tracker-react.db",
    ]);
    expect(previewTauri.plugins.updater.endpoints).toEqual([]);
  });

  it("preserves production identity, database, and updater", () => {
    const config = resolveRuntimeConfig({
      DEV: false,
      PROD: true,
      VITE_DESKTOP_PROFILE: "production",
      VITE_SYNC_API_BASE_URL: "https://sync.example.test",
    });

    expect(config.databaseUrl).toBe("sqlite:student-book-tracker.db");
    expect(config.updaterEnabled).toBe(true);
    expect(productionTauri.identifier).toBe("com.studentbooktracker.app");
    expect(productionTauri.plugins.sql.preload).toEqual([
      "sqlite:student-book-tracker.db",
    ]);
    expect(productionTauri.plugins.updater.endpoints).toContain(
      "https://github.com/SacreddPotato/student-book-tracker/releases/latest/download/latest.json",
    );
  });

  it("rejects an unknown profile", () => {
    expect(() =>
      resolveRuntimeConfig({
        DEV: false,
        PROD: true,
        VITE_DESKTOP_PROFILE: "other",
      }),
    ).toThrow("Unknown desktop profile");
  });

  it("rejects a production database URL before it reaches fetch", () => {
    expect(() =>
      resolveRuntimeConfig({
        DEV: false,
        PROD: true,
        VITE_DESKTOP_PROFILE: "production",
        VITE_SYNC_API_BASE_URL: "postgresql://secret",
      }),
    ).toThrow("HTTP or HTTPS");
  });
});
