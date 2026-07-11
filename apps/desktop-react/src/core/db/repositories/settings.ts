import type { SqlDatabase } from "../types";

export async function getSettingJson<T>(
  database: SqlDatabase,
  key: string,
  fallback: T,
): Promise<T> {
  const rows = await database.select<{ valueJson: string }>(
    "SELECT value_json AS valueJson FROM app_settings WHERE key = $1",
    [key],
  );
  if (!rows[0]) return fallback;
  try {
    return JSON.parse(rows[0].valueJson) as T;
  } catch {
    return fallback;
  }
}

export async function saveSettingJson(
  database: SqlDatabase,
  key: string,
  value: unknown,
  updatedAt: string,
) {
  await database.execute(
    `INSERT INTO app_settings (key, value_json, updated_at)
    VALUES ($1, $2, $3)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
      updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), updatedAt],
  );
}
