// Test-only IPC launcher. No watcher and no production reset endpoint.
import { createRequire } from "node:module"
const requireApi = createRequire(new URL("../../../apps/api/package.json", import.meta.url))
const { serve } = requireApi("@hono/node-server") as typeof import("../../../apps/api/node_modules/@hono/node-server/dist/index.mjs")
import { createApp } from "../../../apps/api/src/app/create-app"
import { createFreshExactAppDependencies } from "../../../apps/api/src/app/fresh-exact-dependencies"
import { createAppConfig } from "../../../apps/api/src/config"

async function main() {
  if (!process.send || process.env.E2E_API_MANAGED !== "1") throw new Error("Managed E2E IPC required")
  const config = createAppConfig()
  const dependencies = await createFreshExactAppDependencies({}, config)
  const app = createApp(dependencies, {
    allowedOrigins: config.allowedOrigins,
    trustProxyHeaders: config.trustProxyHeaders,
    authRateLimitMaxRequests: config.authRateLimitMaxRequests,
  })
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
    process.send!({ ready: true, pid: process.pid, database: config.databasePath })
  })
  server.on("error", error => { console.error(error); process.exit(1) })
  const close = async () => {
    ;(server as unknown as { closeIdleConnections?: () => void }).closeIdleConnections?.()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await dependencies.close()
    process.disconnect?.()
  }
  process.once("message", message => { if (message === "close") void close().catch(error => { console.error(error); process.exit(1) }) })
  process.once("disconnect", () => { if (server.listening) void close() })
}
main().catch(error => { console.error(error); process.exit(1) })
