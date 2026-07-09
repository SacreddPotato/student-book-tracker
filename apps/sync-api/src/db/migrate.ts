import { migrate } from "drizzle-orm/neon-http/migrator";

import { createDbClient } from "./client";

await migrate(createDbClient(), {
  migrationsFolder: "drizzle",
});

console.log("Sync API database migrations applied.");
