import { serve } from "@hono/node-server";

import { createApp } from "./app/create-app";
import { appDependencies } from "./app/dependencies";
import { env } from "./infrastructure/config/env";
import { ensureDatabaseSchema } from "./infrastructure/database/schema";

async function main() {
  await ensureDatabaseSchema();
  const app = createApp(appDependencies);

  serve(
    {
      fetch: app.fetch,
      port: env.port,
      hostname: env.host,
    },
    (info) => {
      console.log(`API listening on http://${info.address}:${info.port}`);
    },
  );
}

main().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
