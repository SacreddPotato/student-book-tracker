import { describe, expect, it } from "vitest";

import { appTabs } from "./app-tabs";

describe("appTabs", () => {
  it("defines the Segment 1 desktop tabs in display order", () => {
    expect(appTabs).toEqual([
      { id: "students", label: "Students" },
      { id: "books", label: "Books" },
      { id: "logs", label: "Logs" },
    ]);
  });
});
