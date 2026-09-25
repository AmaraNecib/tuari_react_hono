import { randomUUID } from "node:crypto"
import { existsSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { isAbsolute, join } from "node:path"

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
    all: (...params: unknown[]) => unknown[]
    get: (...params: unknown[]) => unknown
    run: (...params: unknown[]) => void
  }
  /** Raw SQL execution (used by the db-isolation reset helper). */
  exec: (sql: string) => void
  /** Pragmas such as `foreign_keys` (used by the db-isolation reset helper). */
  pragma: (statement: string) => unknown
  close: () => void
}

let databaseConstructor: ((path: string) => SeedDatabase) | null = null

export function loadDatabaseConstructor() {
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
export function findE2eDatabase(): string {
  // An externally managed API has no local file to reset or seed. Failing here
  // with an explanation beats silently mutating a stale local database while
  // the browser talks to the external one (Greptile finding on this slice).
  if (process.env.E2E_API_MANAGED === "0") {
    throw new Error(
      "This run targets an externally managed API (PLAYWRIGHT_API_URL), so the direct-SQLite fixtures cannot reset or seed its database. Run against a managed local server, or drop the specs that assert on the database file.",
    )
  }
  // Prefer the database THIS run started: playwright.config.ts exports the
  // exact path it handed to the API, so a concurrent run in the same
  // checkout can never be reset by mistake (Greptile finding on this slice).
  const declared = process.env.APP_DB_PATH?.trim()
  if (declared) {
    // The managed API runs with cwd=apps/api (pnpm --filter @tuari/api dev) and
    // opens the file there, while the workers run from the repo root. Check the
    // API's own location FIRST: if both interpretations exist, the repo-root
    // file is not the one the browser reads.
    const candidates = isAbsolute(declared)
      ? [declared]
      : [join(process.cwd(), "apps", "api", declared), join(process.cwd(), declared)]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
    throw new Error(
      `APP_DB_PATH is set to ${declared} but no database exists at: ${candidates.join(", ")} — did the API start?`,
    )
  }
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

/**
 * Seed a single employee linked to an existing role KEY (e.g. worker,
 * project_manager, warehouse_manager). Returns the new employee id. Phones
 * must be unique per test ATTEMPT (see `uniqueSuffix` / retries are shared).
 */
export function seedEmployeeByRole(input: {
  firstName: string
  lastName: string
  phone: string
  roleKey: string
  status?: "ACTIVE" | "INACTIVE" | "LEFT"
}): string {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    const roleRow = db
      .prepare(`SELECT id FROM role WHERE key = ?`)
      .get(input.roleKey) as { id: string } | undefined
    if (!roleRow) {
      throw new Error(`seedEmployeeByRole: role '${input.roleKey}' not seeded`)
    }
    const id = randomUUID()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO employee
         (id, first_name, last_name, phone, user_id, role_id, status,
          salary_amount_dzd, salary_period, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?)`,
    ).run(id, input.firstName, input.lastName, input.phone, roleRow.id, input.status ?? "ACTIVE", ts, ts)
    return id
  } finally {
    db.close()
  }
}

/** Seed an ACTIVE project and assign it to a manager employee. Returns the project id. */
export function seedProjectWithManager(input: {
  name: string
  managerId: string
}): string {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    const id = randomUUID()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO project
         (id, name, location, manager_id, status, notes, created_at, updated_at)
       VALUES (?, ?, NULL, ?, 'ACTIVE', NULL, ?, ?)`,
    ).run(id, input.name, input.managerId, ts, ts)
    return id
  } finally {
    db.close()
  }
}

/** Seed external counterparties for combobox E2E coverage. Returns their ids. */
export function seedExternalCounterparties(
  counterparties: Array<{ fullName: string; phoneNumber: string }>,
): string[] {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    const insert = db.prepare(
      `INSERT INTO external_counterparty
         (id, full_name, phone_number, note, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    )
    const ids: string[] = []
    const now = new Date().toISOString()
    for (const counterparty of counterparties) {
      const id = randomUUID()
      insert.run(id, counterparty.fullName, counterparty.phoneNumber, now, now)
      ids.push(id)
    }
    return ids
  } finally {
    db.close()
  }
}

/** Seed an ACTIVE warehouse. Returns the warehouse id. */
export function seedWarehouse(input: { name: string }): string {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    const id = randomUUID()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO warehouse
         (id, name, address, manager_id, status, notes, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, 'ACTIVE', NULL, ?, ?)`,
    ).run(id, input.name, ts, ts)
    return id
  } finally {
    db.close()
  }
}

/**
 * The result of seeding the legacy user, including the ownership-restore
 * handle the spec must call once it is done (see {@link seedLegacyPasswordUser}).
 */
export type LegacyPasswordSeedResult = {
  /**
   * Restores the bootstrap-owner state the seed changed, so the shared
   * per-run E2E DB keeps the suite's canonical admin as the owner after the
   * legacy spec finishes. Reopens the same DB file the seed wrote to.
   */
  restoreOwner: () => void
}

/**
 * Seed a legacy pre-#230 user whose stored hash was created from an
 * all-invisible password (issue #321 recovery-path E2E).
 *
 * The hash is computed with better-auth's own `hashPassword` (loaded from the
 * pnpm virtual store — same scrypt defaults the API's auth instance verifies
 * with), so a sign-in with the legacy password really verifies against a
 * genuine better-auth hash end to end. A pre-#230 user cannot be created
 * through the bootstrap UI (it rejects all-invisible passwords), so seeding
 * is the only honest way to stage the scenario.
 *
 * Ownership handoff: the app shell mounts the owner-gated `workspaceSnapshot`
 * RPC after ANY sign-in, so the legacy user must be the bootstrap owner while
 * the legacy spec runs (in the #321 scenario they are the original admin who
 * created the account pre-#230). In the full suite an earlier spec has already
 * bootstrapped the workspace, so the singleton `app_bootstrap_state` row is
 * recorded and re-pointed at the legacy user; the returned {@link
 * LegacyPasswordSeedResult.restoreOwner} reverts that so downstream specs keep
 * the canonical admin as owner. In an isolated run no state row exists yet —
 * the seed creates one and the restore drops it again (ownership then falls
 * back to the oldest user, which is the suite admin once the legacy spec ends).
 */
export async function seedLegacyPasswordUser(input: {
  phone: string
  name: string
  legacyPassword: string
}): Promise<LegacyPasswordSeedResult> {
  const dbPath = findE2eDatabase()
  const db = loadDatabaseConstructor()(dbPath)
  try {
    const authReq = loadBetterAuthRequire()
    const { hashPassword } = await authReq("better-auth/crypto")
    const hash = await hashPassword(input.legacyPassword)
    const now = new Date().toISOString()
    const userId = randomUUID()

    // Idempotent across retries: drop any prior legacy user with this phone
    // (cascades to its account/session rows) before inserting fresh rows.
    db.prepare(`DELETE FROM "account" WHERE "accountId" = ?`).run(input.phone)
    db.prepare(`DELETE FROM "user" WHERE "phoneNumber" = ?`).run(input.phone)

    // phoneNumberVerified mirrors the bootstrap-created owner (1): in the #321
    // scenario the legacy user IS the original admin account.
    db.prepare(
      `INSERT INTO "user" (id, name, image, "phoneNumber", "phoneNumberVerified", created_at, updated_at)
       VALUES (?, ?, NULL, ?, 1, ?, ?)`,
    ).run(userId, input.name, input.phone, now, now)
    db.prepare(
      `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
    ).run(randomUUID(), input.phone, userId, hash, now, now)

    // ── Bootstrap-owner handoff ───────────────────────────────────────────
    // Record the current owner state BEFORE mutating it. This is the last
    // write of the seed: if anything above threw, no ownership change was made
    // and restoreOwner() is never returned, so the caller's afterAll no-ops
    // instead of clobbering the suite's real owner.
    const stateRow = db
      .prepare(`SELECT "user_id" AS userId FROM "app_bootstrap_state" WHERE "singleton" = 1`)
      .get() as { userId: string | null } | undefined
    const hadStateRow = stateRow !== undefined
    const previousOwnerId = stateRow?.userId ?? null

    db.prepare(
      `INSERT INTO "app_bootstrap_state" ("singleton", "created_at", "user_id")
       VALUES (1, ?, ?)
       ON CONFLICT("singleton") DO UPDATE SET "user_id" = excluded."user_id"`,
    ).run(now, userId)

    return {
      restoreOwner: () => {
        const restoreDb = loadDatabaseConstructor()(dbPath)
        try {
          if (hadStateRow && previousOwnerId) {
            restoreDb
              .prepare(`UPDATE "app_bootstrap_state" SET "user_id" = ? WHERE "singleton" = 1`)
              .run(previousOwnerId)
          } else if (hadStateRow) {
            // The row existed but had no owner (user_id NULL): restore exactly
            // that state.
            restoreDb
              .prepare(`UPDATE "app_bootstrap_state" SET "user_id" = NULL WHERE "singleton" = 1`)
              .run()
          } else {
            // No state row existed before the seed: drop the one we created so
            // ownership falls back to the oldest user (the suite's admin, whose
            // createdAt predates the legacy user's).
            restoreDb.prepare(`DELETE FROM "app_bootstrap_state" WHERE "singleton" = 1`).run()
          }
        } finally {
          restoreDb.close()
        }
      },
    }
  } finally {
    db.close()
  }
}

let betterAuthRequire: ReturnType<typeof createRequire> | null = null

/**
 * Load better-auth from the pnpm virtual store (isolated linker — not
 * resolvable from the repo root), mirroring how `better-sqlite3` is loaded
 * above. The store directory hash changes between installs, so the entry is
 * discovered by prefix rather than pinned.
 */
function loadBetterAuthRequire(): ReturnType<typeof createRequire> {
  if (betterAuthRequire) return betterAuthRequire
  const pnpmDir = join(process.cwd(), "node_modules", ".pnpm")
  const entry = readdirSync(pnpmDir).find(
    (dir) => dir.startsWith("better-auth@") && !dir.includes("sqlcipher"),
  )
  if (!entry) {
    throw new Error("better-auth not found in the pnpm virtual store")
  }
  betterAuthRequire = createRequire(
    join(pnpmDir, entry, "node_modules", "better-auth", "package.json"),
  )
  return betterAuthRequire
}
