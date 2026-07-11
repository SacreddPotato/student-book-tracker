import type { TranslationKey } from "$lib/i18n";

export type AppTabId = "students" | "books" | "logs";

export type AppTab = {
  id: AppTabId;
  labelKey: TranslationKey;
};

export const appTabs: AppTab[] = [
  { id: "students", labelKey: "tabs.students" },
  { id: "books", labelKey: "tabs.books" },
  { id: "logs", labelKey: "tabs.logs" },
];
