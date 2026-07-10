import { describe, expect, it } from "vitest";

import { getSyncRuntimeConfig } from "./api-client";

describe("sync runtime configuration", () => {
  it("uses the local development sync API when a development URL is not configured", () => {
    expect(getSyncRuntimeConfig({ DEV: true })).toEqual({
      apiBaseUrl: "http://127.0.0.1:8787",
      transportToken: null,
    });
  });

  it("requires production builds to provide their deployed sync API URL", () => {
    expect(getSyncRuntimeConfig({ DEV: false })).toEqual({
      apiBaseUrl: null,
      transportToken: null,
    });
  });

  it("reads configured production endpoint and optional transport token", () => {
    expect(
      getSyncRuntimeConfig({
        DEV: false,
        VITE_SYNC_API_BASE_URL: "https://sync.example.test",
        VITE_SYNC_API_SHARED_SECRET: "desktop-transport-token",
      }),
    ).toEqual({
      apiBaseUrl: "https://sync.example.test",
      transportToken: "desktop-transport-token",
    });
  });

  it("rejects database URLs before they can reach browser fetch or error storage", () => {
    expect(() =>
      getSyncRuntimeConfig({
        DEV: true,
        VITE_SYNC_API_BASE_URL: "postgresql://database.example.test/app",
      }),
    ).toThrow("must be an HTTP(S) API URL without embedded credentials");
  });
});
