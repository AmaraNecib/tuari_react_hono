import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const databaseModule = require.resolve("better-sqlite3")
const scratchDirs: string[] = []

const childProbe = String.raw`
const [mode, databasePath, tempDirectory, modulePath] = process.argv.slice(1)
for (const key of ['TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA']) delete process.env[key]
if (mode === 'temp-only') process.env.TEMP = tempDirectory
const Database = require(modulePath)
const db = new Database(databasePath)
db.pragma('journal_mode=WAL')
db.exec('CREATE TABLE test(id INTEGER PRIMARY KEY, value BLOB); INSERT INTO test VALUES(1, zeroblob(100000));')
try {
  db.exec('BEGIN IMMEDIATE; UPDATE test SET value=zeroblob(100000) WHERE id=1; SAVEPOINT nested; UPDATE test SET value=randomblob(100000) WHERE id=1; RELEASE nested; ROLLBACK;')
  console.log('SAVEPOINT PASS')
} catch (error) {
  console.log(JSON.stringify({code: error.code, message: error.message}))
  if (db.inTransaction) db.exec('ROLLBACK')
} finally {
  db.close()
}
`

function runSavepointProbe(mode: "cleared" | "temp-only") {
  const scratchDir = mkdtempSync(join(tmpdir(), "tuari-sqlite-temp-"))
  scratchDirs.push(scratchDir)
  const tempDirectory = join(scratchDir, "temp")
  mkdirSync(tempDirectory)
  const databasePath = join(scratchDir, `${mode}.sqlite`)
  const env: NodeJS.ProcessEnv = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH }
  if (mode === "temp-only") env.TEMP = tempDirectory

  return spawnSync(
    process.execPath,
    ["-e", childProbe, mode, databasePath, tempDirectory, databaseModule],
    { env, encoding: "utf8" },
  )
}

afterEach(() => {
  for (const scratchDir of scratchDirs.splice(0)) rmSync(scratchDir, { recursive: true, force: true })
})

describe.skipIf(process.platform !== "win32")("SQLite savepoint temp environment regression", () => {
  it("fails without temp variables and succeeds when TEMP points to a usable directory", () => {
    const cleared = runSavepointProbe("cleared")
    expect(cleared.status, cleared.stderr).toBe(0)
    expect(cleared.stdout).toContain('"code":"SQLITE_CANTOPEN"')

    const tempOnly = runSavepointProbe("temp-only")
    expect(tempOnly.status, tempOnly.stderr).toBe(0)
    expect(tempOnly.stdout).toContain("SAVEPOINT PASS")
  })
})
