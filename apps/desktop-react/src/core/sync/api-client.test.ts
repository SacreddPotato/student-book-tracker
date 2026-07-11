import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchSyncApiClient } from "./api-client";

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
      occurredAt: "2026-07-08T10:00:00.000Z", bookId: "book-1", quantity: 2,
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
});
