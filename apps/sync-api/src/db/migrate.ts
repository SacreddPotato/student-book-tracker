import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDbClient } from "./client";

const database = createDbClient();

try {
  await migrate(database, {
    migrationsFolder: "drizzle",
  });

  console.log("Sync API database migrations applied.");
} finally {
  await database.$client.end({ timeout: 5 });
}
