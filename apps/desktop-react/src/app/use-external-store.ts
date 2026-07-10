import { useSyncExternalStore } from "react";

import type { ExternalStore } from "../core/state/external-store";

export function useExternalStore<T>(store: ExternalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
