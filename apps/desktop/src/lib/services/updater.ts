import { isTauri } from "@tauri-apps/api/core";
import { writable } from "svelte/store";

import desktopPackage from "../../../package.json";

export type UpdaterPhase =
  | "idle"
  | "disabled"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "failed";

export type UpdaterState = {
  phase: UpdaterPhase;
  currentVersion: string;
  availableVersion: string | null;
  error: string | null;
};

export type AvailableUpdate = {
  version: string;
  download(): Promise<void>;
  install(): Promise<void>;
};

export type UpdaterClient = {
  check(): Promise<AvailableUpdate | null>;
};

export const desktopVersion = desktopPackage.version;

export const initialUpdaterState: UpdaterState = {
  phase: "idle",
  currentVersion: desktopVersion,
  availableVersion: null,
  error: null,
};

export const updaterStatus = writable<UpdaterState>(initialUpdaterState);

let pendingUpdate: AvailableUpdate | null = null;

export function updaterIsEnabled(): boolean {
  return import.meta.env.PROD && isTauri();
}

export async function runStartupUpdateCheck(): Promise<void> {
  await checkForUpdates();
}

export async function checkForUpdates(options: {
  client?: UpdaterClient;
  enabled?: boolean;
} = {}): Promise<void> {
  const enabled = options.enabled ?? updaterIsEnabled();

  if (!enabled) {
    pendingUpdate = null;
    updaterStatus.set({
      ...initialUpdaterState,
      phase: "disabled",
    });
    return;
  }

  updaterStatus.set({
    ...initialUpdaterState,
    phase: "checking",
  });

  try {
    const client = options.client ?? (await loadUpdaterClient());
    const update = await client.check();
    pendingUpdate = update;

    updaterStatus.set({
      ...initialUpdaterState,
      phase: update ? "available" : "upToDate",
      availableVersion: update?.version ?? null,
    });
  } catch (error) {
    pendingUpdate = null;
    updaterStatus.set({
      ...initialUpdaterState,
      phase: "failed",
      error: readError(error),
    });
  }
}

export async function downloadAvailableUpdate(): Promise<void> {
  if (!pendingUpdate) {
    return;
  }

  updaterStatus.update((state) => ({ ...state, phase: "downloading", error: null }));

  try {
    await pendingUpdate.download();
    updaterStatus.update((state) => ({ ...state, phase: "ready" }));
  } catch (error) {
    updaterStatus.update((state) => ({ ...state, phase: "failed", error: readError(error) }));
  }
}

export async function installAvailableUpdate(): Promise<void> {
  if (!pendingUpdate) {
    return;
  }

  updaterStatus.update((state) => ({ ...state, phase: "installing", error: null }));

  try {
    await pendingUpdate.install();
  } catch (error) {
    updaterStatus.update((state) => ({ ...state, phase: "failed", error: readError(error) }));
  }
}

export function resetUpdaterState(): void {
  pendingUpdate = null;
  updaterStatus.set(initialUpdaterState);
}

async function loadUpdaterClient(): Promise<UpdaterClient> {
  const { check } = await import("@tauri-apps/plugin-updater");
  return { check };
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown updater error.";
}
