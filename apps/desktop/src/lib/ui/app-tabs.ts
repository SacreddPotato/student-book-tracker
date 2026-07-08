export type AppTabId = "students" | "books" | "logs";

export type AppTab = {
  id: AppTabId;
  label: string;
};

export const appTabs: AppTab[] = [
  { id: "students", label: "Students" },
  { id: "books", label: "Books" },
  { id: "logs", label: "Logs" },
];
