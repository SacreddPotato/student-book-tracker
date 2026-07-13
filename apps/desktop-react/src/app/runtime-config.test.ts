import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import productionTauri from "../../src-tauri/tauri.production.conf.json";
import previewTauri from "../../src-tauri/tauri.conf.json";
import { resolveRuntimeConfig } from "./runtime-config";

describe("resolveRuntimeConfig", () => {
  it("starts the desktop without requiring the local API", () => {
    const rootPackage = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(rootPackage.scripts["dev:desktop"]).toBe("npm run dev:desktop:react");
  });

  it("keeps the release workflow on the production React identity", () => {
    const releaseWorkflow = readFileSync(
      resolve(process.cwd(), "../../.github/workflows/release-windows.yml"),
      "utf8",
    );

    expect(releaseWorkflow).toContain("apps/desktop-react/package.json");
    expect(releaseWorkflow).toContain("projectPath: apps/desktop-react");
    expect(releaseWorkflow).toContain("tauri.production.conf.json");
    expect(releaseWorkflow).toContain(
      "VITE_NEON_SYNC_DATABASE_URL: ${{ secrets.NEON_SYNC_DATABASE_URL }}",
    );
    expect(releaseWorkflow).not.toContain("VITE_SYNC_API_BASE_URL");
    expect(releaseWorkflow).not.toContain("VITE_SYNC_API_SHARED_SECRET");
    expect(productionTauri.identifier).toBe("com.studentbooktracker.app");
    expect(JSON.stringify(productionTauri)).toContain(
      "releases/latest/download/latest.json",
    );
  });

  it("tags and dispatches a release only after an eligible pre-release validation", () => {
    const ci = readFileSync(
      resolve(process.cwd(), "../../.github/workflows/ci.yml"),
      "utf8",
    );
    const release = readFileSync(
      resolve(process.cwd(), "../../.github/workflows/release-windows.yml"),
      "utf8",
    );

    expect(ci).toContain("needs: validate");
    expect(ci).toContain("github.event_name == 'push'");
    expect(ci).toContain("github.ref == 'refs/heads/pre-release'");
    expect(ci).toContain("github.actor != 'github-actions[bot]'");
    expect(ci).toContain("contents: write");
    expect(ci).toContain('current="$(node -p');
    expect(ci).toContain('if [ "$current" != "$version" ]; then');
    expect(ci).toContain('npm version "$version"');
    expect(ci).toContain('if ! git diff --quiet -- apps/desktop-react/package.json package-lock.json; then');
    expect(ci).toContain('git config user.name "github-actions[bot]"');
    expect(ci).toContain('git tag -a "v$version"');
    expect(ci).toContain('git push origin HEAD:pre-release "v$version"');
    expect(ci).toContain("uses: ./.github/workflows/release-windows.yml");
    expect(ci).toContain('source_ref: v${{ needs.tag-release.outputs.version }}');
    expect(release).toContain("workflow_call:");
    expect(release).toContain("source_ref:");
    expect(release).toContain('ref: ${{ inputs.source_ref || github.ref }}');
    expect(release).toContain('if [ -n "${{ inputs.version }}" ]; then');
    expect(release).toContain('tags: ["v*"]');
  });

  it("uses the custom maximized window frame in preview and production", () => {
    for (const config of [previewTauri, productionTauri]) {
      const window = config.app.windows[0];
      expect(window.decorations).toBe(false);
      expect(window.maximized).toBe(true);
    }
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
      VITE_NEON_SYNC_DATABASE_URL:
        "postgresql://student_book_sync_client:restricted@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
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

  it("keeps production locally usable when sync is not configured", () => {
    const config = resolveRuntimeConfig({
      DEV: false,
      PROD: true,
      VITE_DESKTOP_PROFILE: "production",
    });

    expect(config).toMatchObject({
      profile: "production",
      databaseUrl: "sqlite:student-book-tracker.db",
      neonSyncDatabaseUrl: null,
      updaterEnabled: true,
    });
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

  it.each([
    ["wrong protocol", "https://student_book_sync_client:pw@ep-test-pooler.us-east-2.aws.neon.tech/neondb"],
    ["non-Neon host", "postgresql://student_book_sync_client:pw@example.test/neondb"],
    ["non-pooler endpoint", "postgresql://student_book_sync_client:pw@ep-test.us-east-2.aws.neon.tech/neondb"],
    ["owner username", "postgresql://neondb_owner:pw@ep-test-pooler.us-east-2.aws.neon.tech/neondb"],
    ["missing password", "postgresql://student_book_sync_client@ep-test-pooler.us-east-2.aws.neon.tech/neondb"],
    ["missing database", "postgresql://student_book_sync_client:pw@ep-test-pooler.us-east-2.aws.neon.tech"],
  ])("rejects %s", (_label, databaseUrl) => {
    expect(() => resolveRuntimeConfig({
      VITE_NEON_SYNC_DATABASE_URL: databaseUrl,
    })).toThrow("Neon sync database URL");
  });

  it("accepts only the restricted pooled Neon URL and never leaks its password", () => {
    const databaseUrl =
      "postgres://student_book_sync_client:p%40ssword@ep-test-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";

    expect(resolveRuntimeConfig({ VITE_NEON_SYNC_DATABASE_URL: databaseUrl }))
      .toMatchObject({ neonSyncDatabaseUrl: databaseUrl });

    const malformed = databaseUrl.replace("ep-test-pooler", "ep-test");
    try {
      resolveRuntimeConfig({ VITE_NEON_SYNC_DATABASE_URL: malformed });
      throw new Error("Expected invalid URL to fail.");
    } catch (error) {
      expect(String(error)).not.toContain("p@ssword");
      expect(String(error)).not.toContain("p%40ssword");
    }
  });
});
