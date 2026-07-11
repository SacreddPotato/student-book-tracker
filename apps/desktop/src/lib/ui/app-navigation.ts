import { writable } from "svelte/store";

import type { AppTabId } from "./app-tabs";

export type AppScreenId = AppTabId | "settings";

export const requestedAppScreen = writable<AppScreenId | null>(null);

export function requestAppScreen(screen: AppScreenId): void {
  requestedAppScreen.set(screen);
}
