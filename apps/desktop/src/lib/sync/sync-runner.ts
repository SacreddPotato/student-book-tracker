import type { SqlDatabase } from "$lib/db/local-db";

import { SyncEngine } from "./sync-engine";

/** Coalesces bursts of sync requests while guaranteeing one final retry. */
export class CoalescingSyncRunner {
  private running: Promise<void> | null = null;
  private requested = false;

  constructor(private readonly runSync: () => Promise<void>) {}

  request(): Promise<void> {
    this.requested = true;
    this.running ??= this.drain();
    return this.running;
  }

  private async drain(): Promise<void> {
    try {
      while (this.requested) {
        this.requested = false;
        await this.runSync();
      }
    } finally {
      this.running = null;
      if (this.requested) {
        void this.request();
      }
    }
  }
}

let requestedDatabase: SqlDatabase | undefined;

const desktopSyncRunner = new CoalescingSyncRunner(async () => {
  const database = requestedDatabase;
  requestedDatabase = undefined;
  await new SyncEngine(database ? { database } : {}).sync();
});

export function requestDesktopSync(database?: SqlDatabase): Promise<void> {
  requestedDatabase ??= database;
  return desktopSyncRunner.request();
}
