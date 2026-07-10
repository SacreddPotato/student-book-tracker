export type SqlValue = string | number | null | Uint8Array;

export type SqlStatement = {
  query: string;
  values: SqlValue[];
};

export type SqlDatabase = {
  execute(sql: string, values?: SqlValue[]): Promise<unknown>;
  select<T>(sql: string, values?: SqlValue[]): Promise<T[]>;
  executeTransaction?(
    databaseFile: string,
    statements: SqlStatement[],
  ): Promise<void>;
  databaseFile?: string;
};
