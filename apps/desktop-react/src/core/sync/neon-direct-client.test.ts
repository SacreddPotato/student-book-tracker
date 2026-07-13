import type { SyncCommand } from "@app/shared";
import { describe, expect, it, vi } from "vitest";

import { NeonDirectSyncClient } from "./neon-direct-client";
import type { NeonQuery } from "./neon-query";

const command: SyncCommand = {
  id: "command-1",
  type: "ADD_BOOK_STOCK",
  deviceId: "device-1",
  occurredAt: "2026-07-13T10:00:00.000Z",
  academicYear: "2025-2026",
  bookId: "book-1",
  semester: "first",
  quantity: 2,
  receiptNumber: "00041",
  receiptDate: "2026-01-14",
};

describe("NeonDirectSyncClient", () => {
  it("pushes commands through the single public procedure", async () => {
    const query = mockNeonQuery([{
      payload: { results: [{ commandId: "command-1", status: "accepted" }] },
    }]);
    const client = new NeonDirectSyncClient(query);

    await expect(client.push([command])).resolves.toEqual([
      { commandId: "command-1", status: "accepted" },
    ]);
    expect(query).toHaveBeenCalledWith(
      "SELECT sync_api.sync_push($1::jsonb) AS payload",
      [JSON.stringify([command])],
    );
  });

  it("pulls changes from zero or the supplied cursor", async () => {
    const query = mockNeonQuery([{
      payload: { changes: [], nextCursor: "9" },
    }]);
    const client = new NeonDirectSyncClient(query);

    await expect(client.pull(null)).resolves.toEqual({ changes: [], nextCursor: "9" });
    expect(query).toHaveBeenCalledWith(
      "SELECT sync_api.sync_pull($1::bigint) AS payload",
      ["0"],
    );

    await client.pull("8");
    expect(query).toHaveBeenLastCalledWith(
      "SELECT sync_api.sync_pull($1::bigint) AS payload",
      ["8"],
    );
  });

  it.each([
    [[]],
    [[{ payload: null }]],
    [[{ payload: { results: [{ commandId: 4, status: "accepted" }] } }]],
    [[{ payload: { changes: [{ sequence: "1" }], nextCursor: "1" } }]],
  ])("rejects malformed procedure payloads", async (rows) => {
    const query = mockNeonQuery(rows as Record<string, unknown>[]);
    const client = new NeonDirectSyncClient(query);

    await expect(client.push([command])).rejects.toThrow("Malformed Neon sync response");
    await expect(client.pull(null)).rejects.toThrow("Malformed Neon sync response");
  });

  it("rejects invalid pull cursors before querying Neon", async () => {
    const query = mockNeonQuery([]);
    const client = new NeonDirectSyncClient(query);

    await expect(client.pull("-1")).rejects.toThrow("nonnegative integer");
    expect(query).not.toHaveBeenCalled();
  });
});

function mockNeonQuery(rows: Record<string, unknown>[]): NeonQuery {
  return vi.fn(async () => rows) as unknown as NeonQuery;
}
