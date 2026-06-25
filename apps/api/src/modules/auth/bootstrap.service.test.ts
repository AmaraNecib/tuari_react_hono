import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthBootstrapService } from "./bootstrap.service"

/** Create a chainable mock for Drizzle query builder methods. */
function createChainable(result?: unknown) {
  const data = result ?? []
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(data),
    // Make the chain thenable so `await chain.from().where()` resolves to data
    then: vi.fn((resolve: (value: unknown) => void) => resolve(data)),
  }
  return chain
}

/** Create a mock Drizzle database for testing. */
function createDrizzleMock() {
  const db = {
    select: vi.fn(() => createChainable()),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue(undefined) }),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
    transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => {
      const tx = createDrizzleMock()
      return callback(tx)
    }),
    _setSelectResults: (...results: unknown[][]) => {
      let callIdx = 0
      db.select = vi.fn(() => {
        const chain = createChainable(results[callIdx] ?? [])
        callIdx++
        return chain
      }) as typeof db.select
    },
  }

  return db
}

describe("AuthBootstrapService", () => {
  let db: ReturnType<typeof createDrizzleMock>
  const hash = vi.fn().mockResolvedValue("hashed-password")
  const authInstance = {
    $context: Promise.resolve({
      password: { hash },
    }),
  }

  beforeEach(() => {
    db = createDrizzleMock()
    hash.mockClear()
  })

  it("reports whether configured phone users already exist", async () => {
    const service = new AuthBootstrapService(db as never, { exec: vi.fn() } as never, authInstance as never, null)

    // No users initially
    db._setSelectResults([{ count: 0 }], [{ count: 0 }])
    const result1 = await service.getSetupStatus()
    expect(result1).toEqual({ hasUsers: false, requiresSetupKey: false })

    // Insert a user conceptually — mock returns count: 1
    db._setSelectResults([{ count: 1 }], [{ count: 0 }])
    const result2 = await service.getSetupStatus()
    expect(result2).toEqual({ hasUsers: true, requiresSetupKey: false })
  })

  it("creates the first auth user with phone credentials inside a transaction", async () => {
    const service = new AuthBootstrapService(db as never, { exec: vi.fn() } as never, authInstance as never, null)

    db.transaction.mockImplementationOnce(async (callback: (tx: ReturnType<typeof createDrizzleMock>) => Promise<unknown>) => {
      const tx = createDrizzleMock()
      tx._setSelectResults([{ count: 0 }], [{ count: 0 }])
      return callback(tx)
    })

    await expect(
      service.bootstrapFirstUser({
        name: "المدير الأول",
        phone: "0612345678",
        password: "password123",
      }),
    ).resolves.toMatchObject({
      success: true,
      item: {
        name: "المدير الأول",
        phone: "0612345678",
      },
    })
  })

  it("refuses bootstrap after the system is already configured", async () => {
    const service = new AuthBootstrapService(db as never, { exec: vi.fn() } as never, authInstance as never, null)

    // hasConfiguredUsersTx calls db.select() — return count > 0 to indicate users exist
    db._setSelectResults([{ count: 1 }])

    await expect(
      service.bootstrapFirstUser({
        name: "المدير الأول",
        phone: "0612345678",
        password: "password123",
      }),
    ).resolves.toMatchObject({ success: false })
  })

  it("returns a conflict when the bootstrap lock is already taken concurrently", async () => {
    const service = new AuthBootstrapService(db as never, { exec: vi.fn() } as never, authInstance as never, null)

    // First select (getSetupStatus) returns 0 users, second select (inside bootstrap) returns 1
    let callCount = 0
    db.select = vi.fn(() => {
      callCount++
      if (callCount === 1) return createChainable([{ count: 0 }])
      return createChainable([{ count: 1 }])
    }) as typeof db.select

    // Insert will fail with UNIQUE constraint
    db.insert = vi.fn(() => ({
      values: vi.fn().mockReturnValue({ run: vi.fn().mockImplementation(() => {
        throw new Error("UNIQUE constraint failed")
      }) }),
    })) as typeof db.insert

    await expect(
      service.bootstrapFirstUser({
        name: "المدير الأول",
        phone: "0612345678",
        password: "password123",
      }),
    ).resolves.toMatchObject({ success: false })
  })

  it("requires the optional bootstrap setup key when configured", async () => {
    const service = new AuthBootstrapService(db as never, { exec: vi.fn() } as never, authInstance as never, "setup-secret")

    await expect(
      service.bootstrapFirstUser({
        name: "المدير الأول",
        phone: "0612345678",
        password: "password123",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        fieldErrors: [{ field: "setupSecret" }],
      },
    })
    expect(db.transaction).not.toHaveBeenCalled()
  })
})
