import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthBootstrapService } from "./bootstrap.service"

function createPrismaMock() {
  const tx = {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    user: {
      create: vi.fn(),
    },
    account: {
      create: vi.fn(),
    },
  }

  return {
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    user: tx.user,
    account: tx.account,
    tx,
  }
}

describe("AuthBootstrapService", () => {
  const prisma = createPrismaMock()
  const hash = vi.fn().mockResolvedValue("hashed-password")
  const authInstance = {
    $context: Promise.resolve({
      password: { hash },
    }),
  }

  beforeEach(() => {
    prisma.$queryRawUnsafe.mockReset()
    prisma.$transaction.mockClear()
    prisma.tx.$queryRawUnsafe.mockReset()
    prisma.tx.$executeRawUnsafe.mockReset()
    prisma.tx.user.create.mockReset()
    prisma.tx.account.create.mockReset()
    hash.mockClear()
  })

  it("reports whether configured phone users already exist", async () => {
    const service = new AuthBootstrapService(prisma as never, authInstance as never, null)
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
    await expect(service.getSetupStatus()).resolves.toEqual({ hasUsers: false, requiresSetupKey: false })

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
    await expect(service.getSetupStatus()).resolves.toEqual({ hasUsers: true, requiresSetupKey: false })
  })

  it("creates the first auth user with phone credentials inside a transaction", async () => {
    const service = new AuthBootstrapService(prisma as never, authInstance as never, null)
    prisma.tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
    prisma.tx.user.create.mockResolvedValue({
      id: "user-1",
      name: "المدير الأول",
      phoneNumber: "0612345678",
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
        id: "user-1",
        name: "المدير الأول",
        phone: "0612345678",
      },
    })

    expect(prisma.tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'INSERT INTO "app_bootstrap_state" ("singleton", "created_at") VALUES (1, ?)',
      expect.any(String),
    )
    expect(prisma.tx.account.create).toHaveBeenCalledTimes(1)
  })

  it("refuses bootstrap after the system is already configured", async () => {
    const service = new AuthBootstrapService(prisma as never, authInstance as never, null)
    prisma.tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])

    await expect(
      service.bootstrapFirstUser({
        name: "المدير الأول",
        phone: "0612345678",
        password: "password123",
      }),
    ).resolves.toMatchObject({ success: false })
    expect(prisma.tx.user.create).not.toHaveBeenCalled()
  })

  it("returns a conflict when the bootstrap lock is already taken concurrently", async () => {
    const service = new AuthBootstrapService(prisma as never, authInstance as never, null)
    prisma.tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
    prisma.tx.$executeRawUnsafe.mockRejectedValue(new Error("UNIQUE constraint failed: app_bootstrap_state.singleton"))

    await expect(
      service.bootstrapFirstUser({
        name: "المدير الأول",
        phone: "0612345678",
        password: "password123",
      }),
    ).resolves.toMatchObject({ success: false })
  })

  it("requires the optional bootstrap setup key when configured", async () => {
    const service = new AuthBootstrapService(prisma as never, authInstance as never, "setup-secret")

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
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
