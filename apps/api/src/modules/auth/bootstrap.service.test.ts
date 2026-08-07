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

  it.each([
    { label: "empty name", name: "", field: "name" },
    { label: "whitespace-only name", name: "   ", field: "name" },
    { label: "over-long name", name: "x".repeat(121), field: "name" },
    // #234 hygiene class: trim() keeps format chars (ZWSP), so an
    // invisible-only name must be rejected by the visible-character rule.
    {
      label: "zero-width-only name",
      name: "\u200B\u200B",
      field: "name",
    },
    {
      label: "whitespace + zero-width name",
      name: " \u200B ",
      field: "name",
    },
  ])("rejects $label before hashing or touching the port", async ({ name, field }) => {
    const service = createService()

    const result = await service.bootstrapFirstUser({ ...BOOTSTRAP_INPUT, name })

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION", fieldErrors: [{ field }] },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it.each([
    { label: "empty phone", phone: "", field: "phone" },
    { label: "whitespace-only phone", phone: "     ", field: "phone" },
    { label: "malformed phone", phone: "1234567890", field: "phone" },
    { label: "9-digit phone", phone: "050000000", field: "phone" },
    { label: "11-digit phone", phone: "05000000000", field: "phone" },
    // #234 hygiene class: format chars (ZWSP) are not stripped by trim() and
    // must not be able to hide inside the digits — the regex is a hard gate.
    {
      label: "phone with embedded zero-width character",
      phone: "05\u200B12345678",
      field: "phone",
    },
    {
      label: "phone with trailing zero-width character",
      phone: "0612345678\u200B",
      field: "phone",
    },
  ])("rejects $label before hashing or touching the port", async ({ phone, field }) => {
    const service = createService()

    const result = await service.bootstrapFirstUser({ ...BOOTSTRAP_INPUT, phone })

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION", fieldErrors: [{ field }] },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it.each([
    { label: "empty password", password: "", field: "password" },
    { label: "short password", password: "1234567", field: "password" },
    { label: "over-long password", password: "x".repeat(129), field: "password" },
  ])("rejects $label before hashing or touching the port", async ({ password, field }) => {
    const service = createService()

    const result = await service.bootstrapFirstUser({ ...BOOTSTRAP_INPUT, password })

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION", fieldErrors: [{ field }] },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it.each([
    {
      field: "name",
      input: { name: "" },
      message: "الاسم مطلوب.",
    },
    {
      field: "name",
      input: { name: "x".repeat(121) },
      message: "الاسم يجب ألا يتجاوز 120 حرفًا.",
    },
    {
      field: "phone",
      input: { phone: "" },
      message: "رقم الهاتف يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام.",
    },
    {
      field: "password",
      input: { password: "1234567" },
      message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
    },
    {
      field: "password",
      input: { password: "x".repeat(129) },
      message: "كلمة المرور يجب ألا تتجاوز 128 حرفًا.",
    },
    {
      field: "setupSecret",
      input: { setupSecret: "" },
      message: "رمز الإعداد الأول مطلوب.",
    },
  ])("reports an Arabic message for a $field issue", async ({ input, field, message }) => {
    const service = createService("setup-secret")

    const result = await service.bootstrapFirstUser({ ...BOOTSTRAP_INPUT, ...input })

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION", fieldErrors: [{ field, message }] },
    })
  })

  it("reports the invisible-characters message for a Cf-only name", async () => {
    const service = createService()

    const result = await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      name: "\u200B\u200B",
    })

    expect(result).toEqual({
      success: false,
      error: {
        code: "VALIDATION",
        message: expect.any(String),
        fieldErrors: [
          {
            field: "name",
            message: "الاسم يجب ألا يحتوي على أحرف غير مرئية.",
          },
        ],
      },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("reports every invalid field in a single VALIDATION result", async () => {
    const service = createService()

    const result = await service.bootstrapFirstUser({
      name: "",
      phone: "   ",
      password: "1234567",
    })

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION",
        fieldErrors: [{ field: "name" }, { field: "phone" }, { field: "password" }],
      },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("reports a required message for a missing name from a type-abused caller", async () => {
    const service = createService()

    const result = await service.bootstrapFirstUser({
      phone: "0612345678",
      password: "password123",
    } as never)

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION",
        fieldErrors: [{ field: "name", message: "الاسم مطلوب." }],
      },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("reports a required message for a missing phone from a type-abused caller", async () => {
    const service = createService()

    const result = await service.bootstrapFirstUser({
      name: "المدير الأول",
      password: "password123",
    } as never)

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION",
        fieldErrors: [{ field: "phone", message: "رقم الهاتف مطلوب." }],
      },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("rejects non-object input with a root-level field error", async () => {
    const service = createService()

    const result = await service.bootstrapFirstUser(null as never)

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION", fieldErrors: [{ field: "input" }] },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("accepts boundary-length name and password as valid input", async () => {
    const service = createService()
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: "x".repeat(120), phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    const result = await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      name: "x".repeat(120),
      password: "12345678",
    })

    expect(result.success).toBe(true)
    expect(hash).toHaveBeenCalledWith("12345678")
  })

  it("reports the failing field and an Arabic message for a blank phone", async () => {
    const service = createService()

    const result = await service.bootstrapFirstUser({ ...BOOTSTRAP_INPUT, phone: "" })

    expect(result).toEqual({
      success: false,
      error: {
        code: "VALIDATION",
        message: expect.any(String),
        fieldErrors: [
          {
            field: "phone",
            message: "رقم الهاتف يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام.",
          },
        ],
      },
    })
  })

  it("rejects invalid input before the setup-key gate", async () => {
    const service = createService("setup-secret")

    const result = await service.bootstrapFirstUser({ ...BOOTSTRAP_INPUT, name: "" })

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION" },
    })
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("normalizes padded-but-valid phone and name before handing them to the port", async () => {
    const service = createService()
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      name: `  ${BOOTSTRAP_INPUT.name}  `,
      phone: `  ${BOOTSTRAP_INPUT.phone}  `,
    })

    expect(port.createFirstUser).toHaveBeenCalledWith({
      name: BOOTSTRAP_INPUT.name,
      phone: BOOTSTRAP_INPUT.phone,
      passwordHash: "hashed-password",
    })
  })

  it("rejects an empty setup secret as invalid input when a key is configured", async () => {
    const service = createService("setup-secret")

    const result = await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      setupSecret: "",
    })

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION" },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
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

  it("rejects a present-but-wrong setup secret as unauthorized", async () => {
    const service = createService("setup-secret")
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    const result = await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      setupSecret: "wrong-secret",
    })

    expect(result).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    })
    expect(hash).not.toHaveBeenCalled()
    expect(port.createFirstUser).not.toHaveBeenCalled()
  })

  it("accepts the correct setup secret and proceeds to hashing and the port", async () => {
    const service = createService("setup-secret")
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    const result = await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      setupSecret: "setup-secret",
    })

    expect(result).toMatchObject({ success: true })
    expect(hash).toHaveBeenCalledWith(BOOTSTRAP_INPUT.password)
    expect(port.createFirstUser).toHaveBeenCalled()
  })

  it("accepts a padded correct setup secret (schema trims before comparison)", async () => {
    const service = createService("setup-secret")
    port.createFirstUser.mockResolvedValue({
      status: "created",
      user: { id: "user-1", name: BOOTSTRAP_INPUT.name, phone: BOOTSTRAP_INPUT.phone },
    } satisfies CreateFirstUserResult)

    const result = await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      setupSecret: "  setup-secret  ",
    })

    expect(result).toMatchObject({ success: true })
    expect(port.createFirstUser).toHaveBeenCalled()
  })

  it("rejects a whitespace-only setup secret as invalid input", async () => {
    const service = createService("setup-secret")

    const result = await service.bootstrapFirstUser({
      ...BOOTSTRAP_INPUT,
      setupSecret: "   ",
    })

    expect(result).toMatchObject({
      success: false,
      error: { code: "VALIDATION" },
    })
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
