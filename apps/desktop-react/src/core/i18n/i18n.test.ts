import { describe, expect, it } from "vitest";

import { ar } from "./ar";
import { en } from "./en";
import { getTranslation, translationKeys } from "./index";

function flatten(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === "object"
      ? flatten(nested as Record<string, unknown>, path)
      : [path];
  });
}

describe("React i18n", () => {
  it("keeps English and Arabic keys in exact parity", () => {
    expect(flatten(ar).sort()).toEqual(flatten(en).sort());
    expect(translationKeys.sort()).toEqual(flatten(en).sort());
  });

  it("interpolates translated values", () => {
    expect(getTranslation("en", "common.resultCount", { count: 4 })).toBe("4 results");
    expect(getTranslation("ar", "tabs.students")).not.toBe("Students");
  });
});
