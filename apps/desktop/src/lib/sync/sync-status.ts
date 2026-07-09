import { writable } from "svelte/store";

export type SyncPhase = "idle" | "syncing" | "synced" | "offline" | "rejected" | "error";

export type SyncStatus = {
  phase: SyncPhase;
  pendingCount: number;
  rejectedCount: number;
  lastSyncedAt: string | null;
  message: string | null;
};

export const initialSyncStatus: SyncStatus = {
  phase: "idle",
  pendingCount: 0,
  rejectedCount: 0,
  lastSyncedAt: null,
  message: null,
};

export const syncStatus = writable<SyncStatus>(initialSyncStatus);

export function setSyncStatus(nextStatus: Partial<SyncStatus>): void {
  syncStatus.update((current) => ({ ...current, ...nextStatus }));
}
