import { ar } from "./ar";
import { en, type TranslationDictionary } from "./en";

export type Language = "en" | "ar";
export const languages: Language[] = ["en", "ar"];
export const dictionaries: Record<Language, TranslationDictionary> = { en, ar };

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;
type LeafPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? LeafPaths<T[K], Join<P, K>>
    : Join<P, K>;
}[keyof T & string];
export type TranslationKey = LeafPaths<TranslationDictionary>;

function flatten(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === "object" && !Array.isArray(nested)
      ? flatten(nested as Record<string, unknown>, path)
      : [path];
  });
}

export const translationKeys = flatten(en) as TranslationKey[];

export function getTranslation(
  language: Language,
  key: TranslationKey,
  values: Record<string, string | number> = {},
): string {
  const value = key.split(".").reduce<unknown>(
    (current, segment) => current && typeof current === "object"
      ? (current as Record<string, unknown>)[segment]
      : undefined,
    dictionaries[language],
  );
  if (typeof value !== "string") throw new Error(`Missing translation: ${key}`);
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

export function formatCairoDateTime(language: Language, iso: string): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(iso));
}
