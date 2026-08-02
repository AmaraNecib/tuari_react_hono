import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthBootstrapService } from "./bootstrap.service"
import type { BootstrapPort, CreateFirstUserResult } from "./bootstrap.types"

/** Create a mock BootstrapPort — the persistence seam the service now depends on. */
function createPortMock() {
  return {
    createFirstUser: vi.fn(),
    hasConfiguredUsers: vi.fn(),
    isBootstrapOwner: vi.fn(),
  }
}

describe("AuthBootstrapService", () => {
  let port: ReturnType<typeof createPortMock>
  const hash = vi.fn().mockResolvedValue("hashed-password")
  const authInstance = {
    $context: Promise.resolve({
      password: { hash },
    }),
  }

  beforeEach(() => {
    port = createPortMock()
    hash.mockClear()
  })

  it("reports whether configured phone users already exist", async () => {
    const service = new AuthBootstrapService(port, authInstance as never, null)

    // No users initially
    port.hasConfiguredUsers.mockResolvedValue(false)
    const result1 = await service.getSetupStatus()
    expect(result1).toEqual({ hasUsers: false, requiresSetupKey: false })

    // After setup
    port.hasConfiguredUsers.mockResolvedValue(true)
    const result2 = await service.getSetupStatus()
    expect(result2).toEqual({ hasUsers: true, requiresSetupKey: false })
  })

  it("creates the first auth user with phone credentials inside a transaction", async () => {
    const service = new AuthBootstrapService(port, authInstance as never, null)

    // The transaction itself lives in the adapter (covered against real
    // SQLite in sqlite-bootstrap.port.test.ts); the service hands the port
    // the hashed password and the normalized name.
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: "المدير الأول", phone: "0612345678" },
    } satisfies CreateFirstUserResult)

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      phone: "0612345678",
      password: "password123",
    })

    expect(result).toMatchObject({
      success: true,
      item: { name: "المدير الأول", phone: "0612345678" },
    })

    expect(hash).toHaveBeenCalledWith("password123")
    expect(port.createFirstUser).toHaveBeenCalledWith({
      name: "المدير الأول",
      phone: "0612345678",
      passwordHash: "hashed-password",
    })
  })

  it("refuses bootstrap after the system is already configured", async () => {
    const service = new AuthBootstrapService(port, authInstance as never, null)

    port.createFirstUser.mockResolvedValue({ status: "conflict" })

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      phone: "0612345678",
      password: "password123",
    })

    expect(result).toMatchObject({ success: false })
  })

  it("returns a conflict when the bootstrap lock is already taken concurrently", async () => {
    const service = new AuthBootstrapService(port, authInstance as never, null)

    // A concurrent race surfaces as a UNIQUE violation inside the adapter,
    // which normalizes it to the same conflict outcome (covered against real
    // SQLite in sqlite-bootstrap.port.test.ts).
    port.createFirstUser.mockResolvedValue({ status: "conflict" })

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      phone: "0612345678",
      password: "password123",
    })

    expect(result).toMatchObject({ success: false })
  })

  it("requires the optional bootstrap setup key when configured", async () => {
    const service = new AuthBootstrapService(port, authInstance as never, "setup-secret")

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

    // The port must not be reached when the setup key is missing.
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })
})
