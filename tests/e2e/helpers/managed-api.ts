import { fork, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

let child: ChildProcess | undefined
const root = process.cwd()
const apiRoot = resolve(root, "apps/api")
const requireApi = createRequire(resolve(apiRoot, "package.json"))

export async function stopManagedApi() {
  if (!child) return
  const owned = child
  if (owned.exitCode !== null) { child = undefined; throw new Error(`Managed API already exited ${owned.exitCode}`) }
  await new Promise<void>((resolveStop, reject) => {
    const timer = setTimeout(() => reject(new Error(`API ${owned.pid} did not close; refusing a fresh database`)), 15_000)
    owned.once("exit", code => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`API ${owned.pid} exited ${code}`))
      else resolveStop()
    })
    if (owned.connected) owned.send("close")
    else { clearTimeout(timer); reject(new Error("Lost managed API IPC ownership")) }
  })
  child = undefined
}

export async function restartManagedApi() {
  if (process.env.E2E_API_MANAGED !== "1") throw new Error("Fresh database requires managed API")
  await stopManagedApi()
  const database = resolve(apiRoot, "data", `tuari.phase1.integration.${randomUUID()}.sqlite`)
  if (existsSync(database)) throw new Error("Refusing existing E2E database")
  mkdirSync(resolve(apiRoot, "data"), { recursive: true })
  process.env.APP_DB_PATH = database
  const owned = fork(resolve(root, "tests/e2e/helpers/managed-api-entry.mts"), [], {
    cwd: apiRoot,
    execArgv: ["--import", pathToFileURL(requireApi.resolve("tsx")).href],
    env: { ...process.env, APP_DB_PATH: database },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  })
  child = owned
  owned.once("exit", () => { if (child === owned) child = undefined })
  try {
    await new Promise<void>((ready, reject) => {
      const timer = setTimeout(() => reject(new Error("Managed API startup timeout")), 60_000)
      owned.once("error", error => { clearTimeout(timer); reject(error) })
      owned.once("exit", code => { clearTimeout(timer); reject(new Error(`Managed API exited before ready: ${code}`)) })
      owned.once("message", (message: { ready?: boolean; pid?: number; database?: string }) => {
        clearTimeout(timer)
        if (!message.ready || message.pid !== owned.pid || message.database !== database) reject(new Error("Managed API identity mismatch"))
        else ready()
      })
    })
  } catch (error) {
    if (owned.connected) await stopManagedApi()
    throw error
  }
  return { pid: owned.pid!, database }
}
