import { describe, expect, it } from "vitest";

import { ar } from "./ar";
import { en } from "./en";
import { getTranslation, translationKeys } from "./index";

function flattenKeys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      return flattenKeys(nestedValue as Record<string, unknown>, path);
    }

    return [path];
  });
}

describe("desktop i18n dictionaries", () => {
  it("keeps English and Arabic dictionary key sets in sync", () => {
    expect(flattenKeys(ar).sort()).toEqual(flattenKeys(en).sort());
  });

  it("exports the flattened translation keys used by components", () => {
    expect(translationKeys).toContain("tabs.students");
    expect(translationKeys).toContain("grades.primary1");
    expect(translationKeys).toContain("warnings.unsavedBookSelection");
    expect(translationKeys).toContain("export.studentSignature");
  });

  it("looks up translations by language and dotted key", () => {
    expect(getTranslation("en", "tabs.students")).toBe("Students");
    expect(getTranslation("ar", "tabs.students")).toBe("الطلاب");
  });
});
