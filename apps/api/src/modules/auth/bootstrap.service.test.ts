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

    // After setup
    db._setSelectResults([{ count: 1 }], [{ count: 0 }])
    const result2 = await service.getSetupStatus()
    expect(result2).toEqual({ hasUsers: true, requiresSetupKey: false })
  })

  it("creates the first auth user with phone credentials inside a transaction", async () => {
    const execMock = vi.fn()
    const service = new AuthBootstrapService(db as never, { exec: execMock } as never, authInstance as never, null)

    // hasConfiguredUsersTx returns 0 (no users)
    db._setSelectResults([{ count: 0 }])

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      phone: "0612345678",
      password: "password123",
    })

    expect(result).toMatchObject({
      success: true,
      item: { name: "المدير الأول", phone: "0612345678" },
    })

    // Verify transaction was used
    expect(execMock).toHaveBeenCalledWith("BEGIN IMMEDIATE")
    expect(execMock).toHaveBeenCalledWith("COMMIT")
    expect(hash).toHaveBeenCalledWith("password123")
  })

  it("refuses bootstrap after the system is already configured", async () => {
    const execMock = vi.fn()
    const service = new AuthBootstrapService(db as never, { exec: execMock } as never, authInstance as never, null)

    // hasConfiguredUsersTx returns count > 0 (users exist)
    db._setSelectResults([{ count: 1 }])

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      phone: "0612345678",
      password: "password123",
    })

    expect(result).toMatchObject({ success: false })

    // Verify transaction was used and committed (conflict is not an error)
    expect(execMock).toHaveBeenCalledWith("BEGIN IMMEDIATE")
    expect(execMock).toHaveBeenCalledWith("COMMIT")
  })

  it("returns a conflict when the bootstrap lock is already taken concurrently", async () => {
    const execMock = vi.fn()
    const service = new AuthBootstrapService(db as never, { exec: execMock } as never, authInstance as never, null)

    // hasConfiguredUsersTx returns 0 (no users) so we proceed to insert
    db._setSelectResults([{ count: 0 }])

    // Insert fails with UNIQUE constraint (race condition)
    db.insert = vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        run: vi.fn().mockImplementation(() => {
          throw new Error("UNIQUE constraint failed")
        }),
      }),
    })) as typeof db.insert

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      phone: "0612345678",
      password: "password123",
    })

    expect(result).toMatchObject({ success: false })

    // Verify transaction was rolled back due to error
    expect(execMock).toHaveBeenCalledWith("BEGIN IMMEDIATE")
    expect(execMock).toHaveBeenCalledWith("ROLLBACK")
  })

  it("requires the optional bootstrap setup key when configured", async () => {
    const service = new AuthBootstrapService(db as never, { exec: vi.fn() } as never, authInstance as never, "setup-secret")

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      phone: "0612345678",
      password: "password123",
    })

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        fieldErrors: [{ field: "setupSecret" }],
      },
    })
  })
})
