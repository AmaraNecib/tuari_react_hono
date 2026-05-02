import { serve } from "@hono/node-server";

import { createApp } from "./app/create-app";
import { createAppDependencies } from "./app/dependencies";
import { env } from "./infrastructure/config/runtime-env";
import { ensureDatabaseSchema } from "./infrastructure/database/schema";

async function main() {
  const appDependencies = await createAppDependencies();
  await ensureDatabaseSchema();
  const app = createApp(appDependencies, {
    allowedOrigins: env.allowedOrigins,
    trustProxyHeaders: env.trustProxyHeaders,
  });

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
