import { writable } from "svelte/store";

import { ar } from "./ar";
import { en, type TranslationDictionary } from "./en";

export const dictionaries: Record<Language, TranslationDictionary> = {
  en,
  ar,
};

export type Language = "en" | "ar";

export const languages: Language[] = ["en", "ar"];

type JoinPath<Prefix extends string, Key extends string> = Prefix extends ""
  ? Key
  : `${Prefix}.${Key}`;

type LeafPaths<T, Prefix extends string = ""> = {
  [Key in keyof T & string]: T[Key] extends Record<string, unknown>
    ? LeafPaths<T[Key], JoinPath<Prefix, Key>>
    : JoinPath<Prefix, Key>;
}[keyof T & string];

export type TranslationKey = LeafPaths<TranslationDictionary>;

export const language = writable<Language>("en");

export function setLanguage(nextLanguage: Language): void {
  language.set(nextLanguage);
}

function flattenKeys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      return flattenKeys(nestedValue as Record<string, unknown>, path);
    }

    return [path];
  });
}

export const translationKeys = flattenKeys(en) as TranslationKey[];

function getByPath(dictionary: TranslationDictionary, key: TranslationKey): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (current, segment) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      dictionary,
    );

  if (typeof value !== "string") {
    throw new Error(`Missing translation for key: ${key}`);
  }

  return value;
}

export function getTranslation(nextLanguage: Language, key: TranslationKey): string {
  return getByPath(dictionaries[nextLanguage], key);
}
