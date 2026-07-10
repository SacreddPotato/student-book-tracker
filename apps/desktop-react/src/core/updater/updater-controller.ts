import { createExternalStore, type ExternalStore } from "../state/external-store";

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

export type UpdaterController = {
  store: ExternalStore<UpdaterState>;
  check(): Promise<void>;
  download(): Promise<void>;
  install(): Promise<void>;
  reset(): void;
};

export function createUpdaterController(options: {
  currentVersion: string;
  enabled: boolean;
  loadClient(): Promise<UpdaterClient>;
}): UpdaterController {
  const initial: UpdaterState = {
    phase: "idle",
    currentVersion: options.currentVersion,
    availableVersion: null,
    error: null,
  };
  const store = createExternalStore(initial);
  let pending: AvailableUpdate | null = null;

  return {
    store,
    async check() {
      if (!options.enabled) {
        pending = null;
        store.update({ ...initial, phase: "disabled" });
        return;
      }
      store.update({ ...initial, phase: "checking" });
      try {
        const client = await options.loadClient();
        pending = await client.check();
        store.update({
          ...initial,
          phase: pending ? "available" : "upToDate",
          availableVersion: pending?.version ?? null,
        });
      } catch (error) {
        pending = null;
        store.update({ ...initial, phase: "failed", error: readError(error) });
      }
    },
    async download() {
      if (!pending) return;
      store.update({ phase: "downloading", error: null });
      try {
        await pending.download();
        store.update({ phase: "ready" });
      } catch (error) {
        store.update({ phase: "failed", error: readError(error) });
      }
    },
    async install() {
      if (!pending) return;
      store.update({ phase: "installing", error: null });
      try {
        await pending.install();
      } catch (error) {
        store.update({ phase: "failed", error: readError(error) });
      }
    },
    reset() {
      pending = null;
      store.update(initial);
    },
  };
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown updater error.";
}
