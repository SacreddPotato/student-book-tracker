import type { SyncCommandResult } from "@app/shared";

import type { LegacySyncCommand } from "./legacy-sync-command";

export type PulledChange = {
  sequence: number;
  commandId: string;
  entityTable: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
};

export type PullResponse = {
  changes: PulledChange[];
  nextCursor: string;
};

export interface SyncApiClient {
  push(commands: LegacySyncCommand[]): Promise<SyncCommandResult[]>;
  pull(since: string | null): Promise<PullResponse>;
}

export type SyncRuntimeConfig = {
  apiBaseUrl: string | null;
  transportToken: string | null;
};

type FetchLike = typeof fetch;

export function getSyncRuntimeConfig(
  environment: Record<string, string | boolean | undefined> = import.meta.env,
): SyncRuntimeConfig {
  const configuredUrl = readHttpUrl(environment.VITE_SYNC_API_BASE_URL);
  const development = environment.DEV === true;

  return {
    apiBaseUrl: configuredUrl ?? (development ? "http://127.0.0.1:8787" : null),
    transportToken: readString(environment.VITE_SYNC_API_SHARED_SECRET),
  };
}

export class FetchSyncApiClient implements SyncApiClient {
  constructor(
    private readonly config: SyncRuntimeConfig,
    private readonly request: FetchLike = fetch,
  ) {}

  async push(commands: LegacySyncCommand[]): Promise<SyncCommandResult[]> {
    const response = await this.request(this.url("sync/push"), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ commands }),
    });
    const payload = await parseResponse(response);

    if (!response.ok || !isRecord(payload) || !Array.isArray(payload.results)) {
      throw new Error(readErrorMessage(payload, response.status));
    }

    return payload.results as SyncCommandResult[];
  }

  async pull(since: string | null): Promise<PullResponse> {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const response = await this.request(this.url(`sync/pull${query}`), {
      headers: this.headers(false),
    });
    const payload = await parseResponse(response);

    if (
      !response.ok ||
      !isRecord(payload) ||
      !Array.isArray(payload.changes) ||
      typeof payload.nextCursor !== "string"
    ) {
      throw new Error(readErrorMessage(payload, response.status));
    }

    return {
      changes: payload.changes as PulledChange[],
      nextCursor: payload.nextCursor,
    };
  }

  private url(path: string): string {
    if (!this.config.apiBaseUrl) {
      throw new Error("Sync API is not configured for this build.");
    }

    return new URL(path, `${this.config.apiBaseUrl.replace(/\/$/, "")}/`).toString();
  }

  private headers(includeJson: boolean): HeadersInit {
    return {
      ...(includeJson ? { "content-type": "application/json" } : {}),
      ...(this.config.transportToken
        ? { "x-sync-api-key": this.config.transportToken }
        : {}),
    };
  }
}

function readString(value: string | boolean | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readHttpUrl(value: string | boolean | undefined): string | null {
  const configured = readString(value);
  if (!configured) {
    return null;
  }

  try {
    const url = new URL(configured);
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password) {
      return configured;
    }
  } catch {
    // The stable configuration error below intentionally omits the supplied value.
  }

  throw new Error(
    "VITE_SYNC_API_BASE_URL must be an HTTP(S) API URL without embedded credentials.",
  );
}

async function parseResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function readErrorMessage(payload: unknown, status: number): string {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : `Sync request failed with status ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
