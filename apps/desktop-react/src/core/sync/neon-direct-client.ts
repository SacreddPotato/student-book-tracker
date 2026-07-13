import type { SyncCommand, SyncCommandResult } from "@app/shared";

import type { PullResponse, PulledChange, SyncApiClient } from "./api-client";
import type { NeonQuery } from "./neon-query";

const pushSql = "SELECT sync_api.sync_push($1::jsonb) AS payload";
const pullSql = "SELECT sync_api.sync_pull($1::bigint) AS payload";
const statuses = new Set(["accepted", "rejected", "duplicate"]);
const reasonCodes = new Set([
  "INSUFFICIENT_STOCK",
  "TRANSACTION_ALREADY_REVERSED",
  "UNKNOWN_STUDENT",
  "UNKNOWN_BOOK",
  "ACADEMIC_YEAR_NOT_INITIALIZED",
  "ACADEMIC_YEAR_ALREADY_INITIALIZED",
  "ACADEMIC_YEAR_MISMATCH",
  "ACADEMIC_YEAR_ARCHIVED",
  "VALIDATION_FAILED",
]);

export class NeonDirectSyncClient implements SyncApiClient {
  constructor(private readonly query: NeonQuery) {}

  async push(commands: SyncCommand[]): Promise<SyncCommandResult[]> {
    const rows = await this.execute(pushSql, [JSON.stringify(commands)]);
    const payload = readProcedurePayload(rows);
    if (!isRecord(payload) || !Array.isArray(payload.results)
      || !payload.results.every(isCommandResult)) {
      throw malformedResponse();
    }
    return payload.results;
  }

  async pull(since: string | null): Promise<PullResponse> {
    const cursor = since ?? "0";
    if (!/^\d+$/.test(cursor)) {
      throw new TypeError("Sync pull cursor must be a nonnegative integer.");
    }

    const rows = await this.execute(pullSql, [cursor]);
    const payload = readProcedurePayload(rows);
    if (!isRecord(payload) || !Array.isArray(payload.changes)
      || !payload.changes.every(isPulledChange)
      || typeof payload.nextCursor !== "string"
      || !/^\d+$/.test(payload.nextCursor)) {
      throw malformedResponse();
    }
    return { changes: payload.changes, nextCursor: payload.nextCursor };
  }

  private async execute(text: string, parameters: readonly unknown[]) {
    try {
      return await this.query(text, parameters);
    } catch {
      throw new TypeError("Neon sync is unavailable.");
    }
  }
}

function readProcedurePayload(rows: Record<string, unknown>[]): unknown {
  if (rows.length !== 1 || !isRecord(rows[0]) || !("payload" in rows[0])) {
    throw malformedResponse();
  }
  const payload = rows[0].payload;
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw malformedResponse();
  }
}

function isCommandResult(value: unknown): value is SyncCommandResult {
  if (!isRecord(value)
    || typeof value.commandId !== "string"
    || typeof value.status !== "string"
    || !statuses.has(value.status)) {
    return false;
  }
  if (value.reasonCode !== undefined
    && (typeof value.reasonCode !== "string" || !reasonCodes.has(value.reasonCode))) {
    return false;
  }
  return value.message === undefined || typeof value.message === "string";
}

function isPulledChange(value: unknown): value is PulledChange {
  return isRecord(value)
    && typeof value.sequence === "number"
    && Number.isSafeInteger(value.sequence)
    && value.sequence >= 0
    && typeof value.commandId === "string"
    && typeof value.entityTable === "string"
    && typeof value.entityId === "string"
    && typeof value.payloadJson === "string"
    && typeof value.createdAt === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function malformedResponse() {
  return new TypeError("Malformed Neon sync response.");
}
