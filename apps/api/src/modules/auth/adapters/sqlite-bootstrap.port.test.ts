import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"

import { schemaStatements } from "../../../infrastructure/database/schema-definitions"
import { createDrizzleFromSqlite } from "../../../infrastructure/database/drizzle"
import { SqliteBootstrapPort } from "./sqlite-bootstrap.port"

type UserRow = {
  id: string
  name: string
  phoneNumber: string
  phoneNumberVerified: number
}
type AccountRow = {
  providerId: string
  userId: string
  password: string | null
}
type BootstrapStateRow = {
  singleton: number
  created_at: string
  user_id: string | null
}
type CountRow = { n: number }

/** Create an in-memory SQLite environment with the full app schema. */
function createTestEnv() {
  const rawDb = new Database(":memory:")
  rawDb.pragma("foreign_keys = ON")
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt)
  }
  const db = createDrizzleFromSqlite(rawDb)
  const port = new SqliteBootstrapPort(db, rawDb)
  return { rawDb, port }
}

const FIRST_USER_INPUT = {
  name: "المدير الأول",
  phone: "0612345678",
  passwordHash: "hashed-password",
} as const

function insertUser(
  rawDb: Database.Database,
  row: { id: string; name: string; phoneNumber: string; createdAt: string },
): void {
  rawDb
    .prepare(
      `INSERT INTO "user" ("id", "name", "phoneNumber", "phoneNumberVerified", "created_at", "updated_at")
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(row.id, row.name, row.phoneNumber, row.createdAt, row.createdAt)
}

describe("SqliteBootstrapPort", () => {
  let env: ReturnType<typeof createTestEnv>

  beforeEach(() => {
    env = createTestEnv()
  })

  it("creates the first user atomically and reports the system as configured", async () => {
    expect(await env.port.hasConfiguredUsers()).toBe(false)

    const result = await env.port.createFirstUser(FIRST_USER_INPUT)

    expect(result.status).toBe("created")
    if (result.status !== "created") return
    expect(result.user).toMatchObject({
      name: FIRST_USER_INPUT.name,
      phone: FIRST_USER_INPUT.phone,
    })
    expect(result.user.id).toBeTruthy()

    // All three rows land together: user + credential account + bootstrap state.
    const userRow = env.rawDb
      .prepare(`SELECT * FROM "user" WHERE "id" = ?`)
      .get(result.user.id) as UserRow | undefined
    expect(userRow).toMatchObject({
      name: FIRST_USER_INPUT.name,
      phoneNumber: FIRST_USER_INPUT.phone,
      phoneNumberVerified: 1,
    })

    const accountRow = env.rawDb
      .prepare(`SELECT * FROM "account" WHERE "userId" = ?`)
      .get(result.user.id) as AccountRow | undefined
    expect(accountRow).toMatchObject({
      providerId: "credential",
      userId: result.user.id,
      password: FIRST_USER_INPUT.passwordHash,
    })

    const stateRow = env.rawDb
      .prepare(`SELECT * FROM "app_bootstrap_state"`)
      .get() as BootstrapStateRow | undefined
    expect(stateRow).toMatchObject({
      singleton: 1,
      user_id: result.user.id,
    })

    expect(await env.port.hasConfiguredUsers()).toBe(true)
    expect(await env.port.isBootstrapOwner(result.user.id)).toBe(true)
    expect(await env.port.isBootstrapOwner("someone-else")).toBe(false)
  })

  it("returns conflict when a user with a valid phone already exists", async () => {
    insertUser(env.rawDb, {
      id: "existing-user",
      name: "مستخدم موجود",
      phoneNumber: "0699999999",
      createdAt: "2024-01-01T00:00:00.000Z",
    })

    const result = await env.port.createFirstUser(FIRST_USER_INPUT)
    expect(result).toEqual({ status: "conflict" })

    // Nothing was inserted.
    const userCount = env.rawDb.prepare(`SELECT count(*) AS n FROM "user"`).get() as CountRow
    expect(userCount.n).toBe(1)
    const stateCount = env.rawDb.prepare(`SELECT count(*) AS n FROM "app_bootstrap_state"`).get() as CountRow
    expect(stateCount.n).toBe(0)
  })

  it("returns conflict when the bootstrap state is already set", async () => {
    env.rawDb
      .prepare(
        `INSERT INTO "app_bootstrap_state" ("singleton", "created_at", "user_id")
         VALUES (1, ?, ?)`,
      )
      .run("2024-01-01T00:00:00.000Z", "existing-user")

    const result = await env.port.createFirstUser(FIRST_USER_INPUT)
    expect(result).toEqual({ status: "conflict" })

    const userCount = env.rawDb.prepare(`SELECT count(*) AS n FROM "user"`).get() as CountRow
    expect(userCount.n).toBe(0)
  })

  it("rolls back and returns conflict on a UNIQUE-constraint race", async () => {
    // A user with an empty phone does not count as "configured" (the pre-check
    // ignores blank phones) but occupies the phoneNumber UNIQUE index, so the
    // user insert collides exactly like a concurrent bootstrap winning the race.
    insertUser(env.rawDb, {
      id: "blank-phone-user",
      name: "مستخدم برقم فارغ",
      phoneNumber: "",
      createdAt: "2024-01-01T00:00:00.000Z",
    })

    const result = await env.port.createFirstUser({ ...FIRST_USER_INPUT, phone: "" })
    expect(result).toEqual({ status: "conflict" })

    // The transaction rolled back: neither the bootstrap state row inserted
    // before the collision, nor any account row, remain.
    const stateCount = env.rawDb.prepare(`SELECT count(*) AS n FROM "app_bootstrap_state"`).get() as CountRow
    expect(stateCount.n).toBe(0)
    const accountCount = env.rawDb.prepare(`SELECT count(*) AS n FROM "account"`).get() as CountRow
    expect(accountCount.n).toBe(0)
  })

  it("falls back to the earliest user when no bootstrap state exists", async () => {
    insertUser(env.rawDb, {
      id: "first",
      name: "الأول",
      phoneNumber: "0611111111",
      createdAt: "2024-01-01T00:00:00.000Z",
    })
    insertUser(env.rawDb, {
      id: "second",
      name: "الثاني",
      phoneNumber: "0622222222",
      createdAt: "2024-01-02T00:00:00.000Z",
    })

    expect(await env.port.isBootstrapOwner("first")).toBe(true)
    expect(await env.port.isBootstrapOwner("second")).toBe(false)
  })

  it("prefers the bootstrap-state owner over the earliest user", async () => {
    insertUser(env.rawDb, {
      id: "earliest",
      name: "الأقدم",
      phoneNumber: "0611111111",
      createdAt: "2024-01-01T00:00:00.000Z",
    })
    env.rawDb
      .prepare(
        `INSERT INTO "app_bootstrap_state" ("singleton", "created_at", "user_id")
         VALUES (1, ?, ?)`,
      )
      .run("2024-01-02T00:00:00.000Z", "state-owner")

    expect(await env.port.isBootstrapOwner("state-owner")).toBe(true)
    expect(await env.port.isBootstrapOwner("earliest")).toBe(false)
  })
})
