import { neon } from "@neondatabase/serverless";

export type NeonQuery = <T extends Record<string, unknown>>(
  text: string,
  parameters: readonly unknown[],
) => Promise<T[]>;

export type NeonQueryFactory = (databaseUrl: string) => NeonQuery;

export const createNeonQuery: NeonQueryFactory = (databaseUrl) => {
  const sql = neon(databaseUrl);

  return async <T extends Record<string, unknown>>(
    text: string,
    parameters: readonly unknown[],
  ): Promise<T[]> => sql.query(text, [...parameters]) as Promise<T[]>;
};
