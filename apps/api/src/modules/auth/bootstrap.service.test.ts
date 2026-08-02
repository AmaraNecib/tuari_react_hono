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

const BOOTSTRAP_INPUT = {
  name: "المدير الأول",
  phone: "0612345678",
  password: "password123",
} as const

describe("AuthBootstrapService", () => {
  let port: ReturnType<typeof createPortMock>
  const hash = vi.fn().mockResolvedValue("hashed-password")
  const authInstance = {
    $context: Promise.resolve({
      password: { hash },
    }),
  }

  const createService = (setupKey: string | null = null) =>
    new AuthBootstrapService(port, authInstance as never, setupKey)

  beforeEach(() => {
    port = createPortMock()
    hash.mockClear()
  })

  it("reports whether configured phone users already exist", async () => {
    const service = createService()

    // No users initially
    port.hasConfiguredUsers.mockResolvedValue(false)
    const result1 = await service.getSetupStatus()
    expect(result1).toEqual({ hasUsers: false, requiresSetupKey: false })

    // After setup
    port.hasConfiguredUsers.mockResolvedValue(true)
    const result2 = await service.getSetupStatus()
    expect(result2).toEqual({ hasUsers: true, requiresSetupKey: false })
  })

  it("reports that a setup key is required when one is configured", async () => {
    const service = createService("setup-secret")
    port.hasConfiguredUsers.mockResolvedValue(false)

    const result = await service.getSetupStatus()

    expect(result).toEqual({ hasUsers: false, requiresSetupKey: true })
  })

  it("creates the first auth user with phone credentials via the port", async () => {
    const service = createService()

    // The transaction itself lives in the adapter (covered against real
    // SQLite in sqlite-bootstrap.port.test.ts); the service hands the port
    // the hashed password and the normalized name.
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    const result = await service.bootstrapFirstUser(BOOTSTRAP_INPUT)

    expect(result).toMatchObject({
      success: true,
      item: { name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    })
    expect(hash).toHaveBeenCalledWith(BOOTSTRAP_INPUT.password)
    expect(port.createFirstUser).toHaveBeenCalledWith({
      name: BOOTSTRAP_INPUT.name,
      phone: BOOTSTRAP_INPUT.phone,
      passwordHash: "hashed-password",
    })
  })

  it("reports the app version on the created user", async () => {
    const service = createService()
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    const result = await service.bootstrapFirstUser(BOOTSTRAP_INPUT)
    if (result.success !== true) throw new Error("expected success")
    expect(result.item.version.length).toBeGreaterThan(0)
  })

  it("trims the display name before handing it to the port", async () => {
    const service = createService()
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    await service.bootstrapFirstUser({ ...BOOTSTRAP_INPUT, name: `  ${BOOTSTRAP_INPUT.name}  ` })

    expect(port.createFirstUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: BOOTSTRAP_INPUT.name }),
    )
  })

  it("returns a conflict result when the system is already configured", async () => {
    const service = createService()

    // The adapter reports the same conflict outcome for both triggers — the
    // in-transaction pre-check and a concurrent UNIQUE-constraint race — so
    // the service sees a single path (real-SQLite coverage of both in
    // sqlite-bootstrap.port.test.ts).
    port.createFirstUser.mockResolvedValue({ status: "conflict" })

    const result = await service.bootstrapFirstUser(BOOTSTRAP_INPUT)

    expect(result).toEqual({
      success: false,
      error: {
        code: "CONFLICT",
        message: "تم إعداد الحساب الأول بالفعل.",
        fieldErrors: [{ field: "phone", message: "تم إعداد الحساب الأول بالفعل." }],
      },
    })
  })

  it("requires the optional bootstrap setup key when configured", async () => {
    const service = createService("setup-secret")

    const result = await service.bootstrapFirstUser(BOOTSTRAP_INPUT)

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        fieldErrors: [{ field: "setupSecret" }],
      },
    })

    // The port is never reached when the setup key is missing.
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("delegates bootstrap-owner checks to the port", async () => {
    const service = createService()
    port.isBootstrapOwner.mockResolvedValue(true)

    await expect(service.isBootstrapOwner("user-1")).resolves.toBe(true)
    expect(port.isBootstrapOwner).toHaveBeenCalledWith("user-1")
  })
})
