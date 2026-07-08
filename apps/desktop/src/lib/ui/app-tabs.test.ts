import { describe, expect, it } from "vitest";

import { appTabs } from "./app-tabs";

describe("appTabs", () => {
  it("defines the Segment 1 desktop tabs in display order", () => {
    expect(appTabs).toEqual([
      { id: "students", labelKey: "tabs.students" },
      { id: "books", labelKey: "tabs.books" },
      { id: "logs", labelKey: "tabs.logs" },
    ]);
  });
});
