import { afterEach, describe, expect, it, vi } from "vitest";

import { createSyncApiClient, FetchSyncApiClient } from "./api-client";
import type { NeonQuery } from "./neon-query";

describe("FetchSyncApiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("invokes the WebView fetch function with the window receiver", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({
        changes: [], nextCursor: "0",
      }), { status: 200, headers: { "content-type": "application/json" } }));
    });
    const client = new FetchSyncApiClient({
      apiBaseUrl: "http://127.0.0.1:8787",
      transportToken: null,
    });

    await expect(client.pull(null)).resolves.toEqual({ changes: [], nextCursor: "0" });
  });

  it("pushes commands with the transport header and parses results", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      results: [{ commandId: "command-1", status: "accepted" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new FetchSyncApiClient({
      apiBaseUrl: "https://sync.example.test",
      transportToken: "token",
    }, request);

    const results = await client.push([{
      id: "command-1", type: "ADD_BOOK_STOCK", deviceId: "device-1",
      occurredAt: "2026-07-08T10:00:00.000Z", academicYear: "2025-2026",
      bookId: "book-1", semester: "first", quantity: 2,
      receiptNumber: "00041", receiptDate: "2026-01-14",
    }]);

    expect(results[0]?.status).toBe("accepted");
    expect(request).toHaveBeenCalledWith(
      "https://sync.example.test/sync/push",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-sync-api-key": "token" }),
      }),
    );
  });

  it("requests pulls from the supplied cursor", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      changes: [], nextCursor: "9",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new FetchSyncApiClient({
      apiBaseUrl: "https://sync.example.test/",
      transportToken: null,
    }, request);

    await client.pull("8");

    expect(request).toHaveBeenCalledWith(
      "https://sync.example.test/sync/pull?since=8",
      expect.any(Object),
    );
  });

  it("creates the direct Neon client when a restricted database URL is configured", async () => {
    const query = mockNeonQuery([{
      payload: { changes: [], nextCursor: "0" },
    }]);
    const createQuery = vi.fn(() => query);
    const client = createSyncApiClient({
      neonDatabaseUrl:
        "postgresql://student_book_sync_client:restricted@ep-example-pooler.us-east-2.aws.neon.tech/neondb",
    }, createQuery);

    await expect(client.pull(null)).resolves.toEqual({ changes: [], nextCursor: "0" });
    expect(createQuery).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledOnce();
  });

  it("creates an unavailable client without making a request when sync is unconfigured", async () => {
    const createQuery = vi.fn();
    const client = createSyncApiClient({
      neonDatabaseUrl: null,
    }, createQuery);

    await expect(client.pull(null)).rejects.toEqual(
      new TypeError("Sync API is not configured for this build."),
    );
    expect(createQuery).not.toHaveBeenCalled();
  });
});

function mockNeonQuery(rows: Record<string, unknown>[]): NeonQuery {
  return vi.fn(async () => rows) as unknown as NeonQuery;
}
