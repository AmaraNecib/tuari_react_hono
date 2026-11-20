import { existsSync } from "node:fs"
import { serve } from "@hono/node-server"
import { createApp } from "../src/app/create-app"
import { createFreshExactAppDependencies } from "../src/app/fresh-exact-dependencies"
import { installShutdownHook } from "../src/app/shutdown"
import { createAppConfig } from "../src/config"

async function main() {
  if (process.env.CONNECTED_EXACT_TEST !== "1" || !process.env.APP_DB_PATH) throw new Error("Explicit isolated test environment required")
  const config = createAppConfig()
  if (existsSync(config.databasePath)) throw new Error("Connected acceptance requires a fresh database file")
  const root = await createFreshExactAppDependencies({}, config)
  const app = createApp(root, { allowedOrigins: config.allowedOrigins, authRateLimitMaxRequests: config.authRateLimitMaxRequests })
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port })
  console.log(JSON.stringify({ entry: import.meta.url, mode: root.mode, database: config.databasePath, port: config.port }))
  installShutdownHook({
    stopServer: () => new Promise<void>(resolve => { (server as unknown as { closeIdleConnections?: () => void }).closeIdleConnections?.(); server.close(() => resolve()) }),
    close: root.close,
  })
}
main().catch(error => { console.error(error); process.exit(1) })
