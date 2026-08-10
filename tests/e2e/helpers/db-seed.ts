import { randomUUID } from "node:crypto"
import { existsSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

/**
 * E2E DB seeding helper (issue #183).
 *
 * Employee creation through the UI/RPC is blocked by a pre-existing role
 * rule (legacy roles removed — tracked #227), so the spec seeds employee
 * rows directly into the E2E sqlite database. The API server runs with
 * `APP_DB_PATH=./data/tuari.phase1.integration.<ts>.sqlite` (plain
 * better-sqlite3, WAL mode), and the bootstrap flow has already migrated
 * the schema and seeded the system roles.
 *
 * `better-sqlite3` is not resolvable from the repo root (pnpm isolated
 * linker), so it is located in the pnpm virtual store and loaded through
 * `createRequire` pinned to that package's package.json.
 */

type SeedEmployee = {
  firstName: string
  lastName: string
  phone: string
  /** Optional row timestamp (ISO). Defaults to now; used to control sort order. */
  createdAt?: string
}

/** The minimal better-sqlite3 surface the seeding needs. */
type SeedDatabase = {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown
    run: (...params: unknown[]) => void
  }
  close: () => void
}

let databaseConstructor: ((path: string) => SeedDatabase) | null = null

function loadDatabaseConstructor() {
  if (databaseConstructor) return databaseConstructor
  const pnpmDir = join(process.cwd(), "node_modules", ".pnpm")
  const entry = readdirSync(pnpmDir).find(
    (dir) => dir.startsWith("better-sqlite3@") && !dir.includes("sqlcipher"),
  )
  if (!entry) {
    throw new Error("better-sqlite3 not found in the pnpm virtual store")
  }
  const req = createRequire(
    join(pnpmDir, entry, "node_modules", "better-sqlite3", "package.json"),
  )
  databaseConstructor = req("better-sqlite3") as (path: string) => SeedDatabase
  return databaseConstructor
}

/**
 * The newest E2E database file for the current run.
 *
 * `APP_DB_PATH=./data/…` is resolved relative to the API package cwd, so the
 * file lands in `apps/api/data/`; the root `data/` is checked as a fallback
 * (one file per Playwright run — the newest by mtime).
 */
function findE2eDatabase(): string {
  const candidates: Array<{ path: string; mtime: number }> = []
  for (const dataDir of [
    join(process.cwd(), "apps", "api", "data"),
    join(process.cwd(), "data"),
  ]) {
    if (!existsSync(dataDir)) continue
    for (const file of readdirSync(dataDir).filter((f) =>
      /^tuari\.phase1\.integration\..+\.sqlite$/.test(f),
    )) {
      const full = join(dataDir, file)
      candidates.push({ path: full, mtime: statSync(full).mtimeMs })
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  const dbPath = candidates[0]?.path
  if (!dbPath) {
    throw new Error(
      "No E2E sqlite database found under apps/api/data or ./data — run the API first",
    )
  }
  return dbPath
}

/**
 * Insert employee rows into the E2E database, linked to the seeded `admin`
 * role. Phones must be unique (table constraint) and not collide with
 * existing seeds.
 */
export function seedEmployees(employees: SeedEmployee[]): void {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    const roleRow = db
      .prepare(`SELECT id FROM role WHERE key = 'admin'`)
      .get() as { id: string } | undefined
    if (!roleRow) {
      throw new Error("admin role is not seeded in the E2E database")
    }

    const insert = db.prepare(
      `INSERT INTO employee
         (id, first_name, last_name, phone, user_id, role_id, status,
          salary_amount_dzd, salary_period, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'ACTIVE', NULL, NULL, NULL, ?, ?)`,
    )
    const defaultTs = new Date().toISOString()
    for (const employee of employees) {
      const ts = employee.createdAt ?? defaultTs
      insert.run(
        randomUUID(),
        employee.firstName,
        employee.lastName,
        employee.phone,
        roleRow.id,
        ts,
        ts,
      )
    }
  } finally {
    db.close()
  }
}
