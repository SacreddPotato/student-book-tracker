import type { SyncCommand, SyncCommandResult } from "@app/shared";

export type PulledChange = {
  sequence: number;
  commandId: string;
  entityTable: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
};

export type PullResponse = { changes: PulledChange[]; nextCursor: string };
export type SyncApiClient = {
  push(commands: SyncCommand[]): Promise<SyncCommandResult[]>;
  pull(since: string | null): Promise<PullResponse>;
};
export type SyncClientConfig = {
  apiBaseUrl: string;
  transportToken: string | null;
};
type FetchLike = typeof fetch;

export class FetchSyncApiClient implements SyncApiClient {
  constructor(
    private readonly config: SyncClientConfig,
    private readonly request: FetchLike = fetch,
  ) {}

  async push(commands: SyncCommand[]): Promise<SyncCommandResult[]> {
    const response = await this.request(this.url("sync/push"), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ commands }),
    });
    const payload = await parseResponse(response);
    if (!response.ok || !isRecord(payload) || !Array.isArray(payload.results)) {
      throw new Error(readError(payload, response.status));
    }
    return payload.results as SyncCommandResult[];
  }

  async pull(since: string | null): Promise<PullResponse> {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const response = await this.request(this.url(`sync/pull${query}`), {
      headers: this.headers(false),
    });
    const payload = await parseResponse(response);
    if (!response.ok || !isRecord(payload) || !Array.isArray(payload.changes)
      || typeof payload.nextCursor !== "string") {
      throw new Error(readError(payload, response.status));
    }
    return { changes: payload.changes as PulledChange[], nextCursor: payload.nextCursor };
  }

  private url(path: string) {
    return new URL(path, `${this.config.apiBaseUrl.replace(/\/$/, "")}/`).toString();
  }

  private headers(json: boolean): HeadersInit {
    return {
      ...(json ? { "content-type": "application/json" } : {}),
      ...(this.config.transportToken
        ? { "x-sync-api-key": this.config.transportToken }
        : {}),
    };
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function readError(payload: unknown, status: number) {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : `Sync request failed with status ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
