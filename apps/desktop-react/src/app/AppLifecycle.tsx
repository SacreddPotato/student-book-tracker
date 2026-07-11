import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useBackend } from "./AppProviders";

export function AppLifecycle() {
  const backend = useBackend();
  const queryClient = useQueryClient();

  useEffect(() => {
    let previousPhase = backend.syncStore.getSnapshot().phase;
    const unsubscribe = backend.syncStore.subscribe(() => {
      const nextPhase = backend.syncStore.getSnapshot().phase;
      if (previousPhase === "syncing" && nextPhase !== "syncing") {
        void queryClient.invalidateQueries();
      }
      previousPhase = nextPhase;
    });
    const requestSync = () => { void backend.requestSync(); };
    requestSync();
    window.addEventListener("online", requestSync);
    return () => {
      window.removeEventListener("online", requestSync);
      unsubscribe();
    };
  }, [backend, queryClient]);

  return null;
}
