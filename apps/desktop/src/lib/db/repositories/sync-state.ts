import type { SqlDatabase } from "../local-db";

export type SyncStateRow = {
  id: string;
  pullCursor: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

const globalSyncStateId = "global";

export async function getSyncState(database: SqlDatabase): Promise<SyncStateRow> {
  const rows = await database.select<SyncStateRow>(
    `SELECT
      id,
      pull_cursor AS pullCursor,
      last_synced_at AS lastSyncedAt,
      last_error AS lastError
    FROM sync_state
    WHERE id = $1`,
    [globalSyncStateId],
  );

  return (
    rows[0] ?? {
      id: globalSyncStateId,
      pullCursor: null,
      lastSyncedAt: null,
      lastError: null,
    }
  );
}

export async function saveSyncState(database: SqlDatabase, state: SyncStateRow): Promise<void> {
  await database.execute(
    `INSERT INTO sync_state (id, pull_cursor, last_synced_at, last_error)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT(id) DO UPDATE SET
      pull_cursor = excluded.pull_cursor,
      last_synced_at = excluded.last_synced_at,
      last_error = excluded.last_error`,
    [state.id, state.pullCursor, state.lastSyncedAt, state.lastError],
  );
}
