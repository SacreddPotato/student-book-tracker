import { and, asc, eq, gt } from "drizzle-orm";

import type { SyncDatabase } from "../db/client";
import { syncChanges } from "../db/schema";

export type PulledChange = {
  sequence: number;
  commandId: string;
  entityTable: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
};

export type PullChangesResult = {
  changes: PulledChange[];
  nextCursor: string;
};

export interface SyncChangeReader {
  pull(since: number): Promise<PullChangesResult>;
}

export class DrizzleSyncChangeReader implements SyncChangeReader {
  constructor(
    private readonly database: SyncDatabase,
    private readonly batchSize = 200,
  ) {}

  async pull(since: number): Promise<PullChangesResult> {
    const changes = await this.database
      .select({
        sequence: syncChanges.sequence,
        commandId: syncChanges.commandId,
        entityTable: syncChanges.entityTable,
        entityId: syncChanges.entityId,
        payloadJson: syncChanges.payloadJson,
        createdAt: syncChanges.createdAt,
      })
      .from(syncChanges)
      .where(and(eq(syncChanges.scopeId, "global"), gt(syncChanges.sequence, since)))
      .orderBy(asc(syncChanges.sequence))
      .limit(this.batchSize);

    return {
      changes,
      nextCursor: String(changes.at(-1)?.sequence ?? since),
    };
  }
}

export function parsePullCursor(value: string | undefined): number | null {
  if (value === undefined) {
    return 0;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const cursor = Number(value);
  return Number.isSafeInteger(cursor) ? cursor : null;
}
