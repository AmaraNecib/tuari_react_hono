import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Database from "better-sqlite3"

import { schemaStatements } from "../../infrastructure/database/schema-definitions"
import { createDrizzleFromSqlite } from "../../infrastructure/database/drizzle"
import { createFifoLock } from "../../infrastructure/database/fifo-lock"
import { DrizzleAccountRepository } from "./account.repository"
import type { AccountRepository } from "./account.repository"
import { AccountService, AccountServiceError } from "./account.service"

describe("AccountService", () => {
  it("updates profile and writes audit history inside one transaction", async () => {
    const headers = new Headers()
    const getSession = vi.fn().mockResolvedValue({
      user: {
        id: "user-1",
        name: "عمارة",
        phoneNumber: "0612345678",
      },
    })
    const findUserIdByPhoneNumber = vi.fn().mockResolvedValue(null)
    const findCredentialPasswordByUserId = vi.fn().mockResolvedValue("hashed-password")
    const updateUserProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "بلال",
      phone: "0612345678",
    })
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
      callback({
          createProfileHistory,
          findCredentialPasswordByUserId,
          findUserIdByPhoneNumber,
          updateUserProfile,
        }),
      ),
    }

    const service = new AccountService(
      repository,
      {
        $context: Promise.resolve({
          password: {
            verify: vi.fn().mockResolvedValue(true),
          },
        }),
        api: {
          getSession,
        },
      },
    )

    const result = await service.updateCurrentProfile(headers, { name: "بلال" })

    expect(result).toEqual({
      user: {
        id: "user-1",
        name: "بلال",
        phone: "0612345678",
      },
    })
    expect(repository.withTransaction).toHaveBeenCalledTimes(1)
    expect(updateUserProfile).toHaveBeenCalledTimes(1)
    expect(createProfileHistory).toHaveBeenCalledTimes(1)
    expect(createProfileHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLabel: "عمارة",
        previousName: "عمارة",
        previousPhone: "0612345678",
      }),
    )
  })

  it("rejects unauthenticated profile updates", async () => {
    const service = new AccountService(
      {
        withTransaction: vi.fn(),
        findCredentialPasswordByUserId: vi.fn(),
      },
      {
        $context: Promise.resolve({
          password: {
            verify: vi.fn(),
          },
        }),
        api: {
          getSession: vi.fn().mockResolvedValue(null),
        },
      },
    )

    await expect(service.updateCurrentProfile(new Headers(), { name: "بلال" })).rejects.toMatchObject({
      message: "يجب تسجيل الدخول أولًا.",
      status: 401,
    })
  })

  it("requires the current password before changing the phone number", async () => {
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory: vi.fn(),
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn(),
        }),
      ),
    }

    const service = new AccountService(
      repository,
      {
        $context: Promise.resolve({
          password: {
            verify: vi.fn(),
          },
        }),
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: {
              id: "user-1",
              name: "عمارة",
              phoneNumber: "0612345678",
            },
          }),
        },
      },
    )

    await expect(service.updateCurrentProfile(new Headers(), { phone: "0612345670" })).rejects.toMatchObject({
      message: "أدخل كلمة المرور الحالية لتغيير رقم الهاتف.",
      status: 400,
    })
  })

  it("records password change audit entries without copying unchanged profile fields", async () => {
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory,
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn(),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: {
          verify: vi.fn(),
        },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    await service.recordPasswordChange(new Headers())

    expect(createProfileHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordChanged: 1,
        previousName: null,
        previousPhone: null,
      }),
    )
  })

  it("records password change audit entries directly for a resolved actor", async () => {
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory,
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn(),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: {
          verify: vi.fn(),
        },
      }),
      api: {
        getSession: vi.fn(),
      },
    })

    await service.recordPasswordChangeForUser({
      id: "user-1",
      name: "عمارة",
      phoneNumber: "0612345678",
    })

    expect(createProfileHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLabel: "عمارة",
        passwordChanged: 1,
      }),
    )
  })

  it("rejects updates with neither name nor phone", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: { getSession: vi.fn() },
      },
    )

    await expect(service.updateCurrentProfile(new Headers(), {})).rejects.toMatchObject({
      message: "أدخل اسمًا أو رقم هاتف واحدًا على الأقل.",
      status: 400,
    })
  })

  it("rejects names longer than 120 characters", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: { getSession: vi.fn() },
      },
    )

    await expect(
      service.updateCurrentProfile(new Headers(), { name: "أ".repeat(121) }),
    ).rejects.toMatchObject({
      message: "يجب أن يكون الاسم بين حرف واحد و120 حرفًا.",
      status: 400,
    })
  })

  it("accepts a name of exactly 120 characters", async () => {
    const updateUserProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "أ".repeat(120),
      phone: "0612345678",
    })
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory: vi.fn(),
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile,
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: { verify: vi.fn() },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    const result = await service.updateCurrentProfile(new Headers(), {
      name: "أ".repeat(120),
    })
    expect(result.user.name).toHaveLength(120)
    expect(updateUserProfile).toHaveBeenCalledTimes(1)
  })

  it("rejects an empty name even when a phone is provided", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: { getSession: vi.fn() },
      },
    )

    // An empty-string name passes the "neither given" check (phone is set),
    // then fails the name-length rule.
    await expect(
      service.updateCurrentProfile(new Headers(), {
        name: "",
        phone: "0612345678",
      }),
    ).rejects.toMatchObject({
      message: "يجب أن يكون الاسم بين حرف واحد و120 حرفًا.",
      status: 400,
    })
  })

  it("rejects a whitespace-only current password when changing the phone", async () => {
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory: vi.fn(),
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn(),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: { verify: vi.fn() },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    await expect(
      service.updateCurrentProfile(new Headers(), {
        phone: "0612345670",
        currentPassword: "   ",
      }),
    ).rejects.toMatchObject({
      message: "أدخل كلمة المرور الحالية لتغيير رقم الهاتف.",
      status: 400,
    })
  })

  it("rejects names that trim to empty", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: { getSession: vi.fn() },
      },
    )

    // A whitespace-only name trims to "" — treated as "no name given".
    await expect(
      service.updateCurrentProfile(new Headers(), { name: "   " }),
    ).rejects.toMatchObject({
      message: "أدخل اسمًا أو رقم هاتف واحدًا على الأقل.",
      status: 400,
    })
  })

  it("rejects non-Algerian phone numbers", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: { getSession: vi.fn() },
      },
    )

    await expect(
      service.updateCurrentProfile(new Headers(), { phone: "0812345678" }),
    ).rejects.toMatchObject({
      message: "أدخل رقم هاتف جزائري صالح.",
      status: 400,
    })
  })

  it("rejects the update when no session user id exists", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: {
          getSession: vi.fn().mockResolvedValue({ user: null }),
        },
      },
    )

    await expect(
      service.updateCurrentProfile(new Headers(), { name: "بلال" }),
    ).rejects.toMatchObject({
      message: "يجب تسجيل الدخول أولًا.",
      status: 401,
    })
  })

  it("rejects the update when the session user has no id", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { name: "عمارة", phoneNumber: "0612345678" },
          }),
        },
      },
    )

    await expect(
      service.updateCurrentProfile(new Headers(), { name: "بلال" }),
    ).rejects.toMatchObject({
      message: "يجب تسجيل الدخول أولًا.",
      status: 401,
    })
  })

  it("rejects the update when the session user has no phone number", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({
          password: { verify: vi.fn() },
        }),
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { id: "user-1", name: "عمارة" },
          }),
        },
      },
    )

    await expect(
      service.updateCurrentProfile(new Headers(), { name: "بلال" }),
    ).rejects.toMatchObject({
      message: "يجب تسجيل الدخول أولًا.",
      status: 401,
    })
  })

  it("updates the phone number when the current password verifies", async () => {
    const headers = new Headers()
    const verify = vi.fn().mockResolvedValue(true)
    const updateUserProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "عمارة",
      phone: "0612345670",
    })
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn().mockResolvedValue("hashed-password"),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory,
          findCredentialPasswordByUserId: vi.fn().mockResolvedValue("hashed-password"),
          findUserIdByPhoneNumber: vi.fn().mockResolvedValue(null),
          updateUserProfile,
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: {
          verify,
        },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    const result = await service.updateCurrentProfile(headers, {
      phone: "0612345670",
      currentPassword: "correct-password",
    })

    expect(result).toEqual({
      user: {
        id: "user-1",
        name: "عمارة",
        phone: "0612345670",
      },
    })
    expect(verify).toHaveBeenCalledWith({
      hash: "hashed-password",
      password: "correct-password",
    })
    expect(updateUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "0612345670" }),
    )
  })

  it("rejects a phone change when no credential password is on record", async () => {
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn().mockResolvedValue(null),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory: vi.fn(),
          findCredentialPasswordByUserId: vi.fn().mockResolvedValue(null),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn(),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: { verify: vi.fn() },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    await expect(
      service.updateCurrentProfile(new Headers(), {
        phone: "0612345670",
        currentPassword: "some-password",
      }),
    ).rejects.toMatchObject({
      message: "تعذر التحقق من كلمة المرور الحالية.",
      status: 400,
    })
  })

  it("rejects a phone change when the current password is wrong", async () => {
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn().mockResolvedValue("hashed-password"),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory: vi.fn(),
          findCredentialPasswordByUserId: vi.fn().mockResolvedValue("hashed-password"),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn(),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: {
          verify: vi.fn().mockResolvedValue(false),
        },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    await expect(
      service.updateCurrentProfile(new Headers(), {
        phone: "0612345670",
        currentPassword: "wrong-password",
      }),
    ).rejects.toMatchObject({
      message: "كلمة المرور الحالية غير صحيحة.",
      status: 401,
    })
  })

  it("rejects a phone change when the phone belongs to another user", async () => {
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn().mockResolvedValue("hashed-password"),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory: vi.fn(),
          findCredentialPasswordByUserId: vi.fn().mockResolvedValue("hashed-password"),
          findUserIdByPhoneNumber: vi.fn().mockResolvedValue("user-other"),
          updateUserProfile: vi.fn(),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: {
          verify: vi.fn().mockResolvedValue(true),
        },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    await expect(
      service.updateCurrentProfile(new Headers(), {
        phone: "0612345670",
        currentPassword: "correct-password",
      }),
    ).rejects.toMatchObject({
      message: "رقم الهاتف مستخدم بالفعل.",
      status: 409,
    })
  })

  it("allows keeping the same phone number without a password", async () => {
    const updateUserProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "عمارة",
      phone: "0612345678",
    })
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory,
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile,
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: { verify: vi.fn() },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "عمارة",
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    const result = await service.updateCurrentProfile(new Headers(), {
      phone: "0612345678",
    })

    expect(result.user.phone).toBe("0612345678")
    expect(updateUserProfile).toHaveBeenCalledTimes(1)
  })

  it("uses the phone as the actor label for a profile update when the name is null", async () => {
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory,
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn().mockResolvedValue({
            id: "user-1",
            name: null,
            phone: "0612345678",
          }),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: { verify: vi.fn() },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: null,
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    await service.updateCurrentProfile(new Headers(), { phone: "0612345678" })

    expect(createProfileHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLabel: "0612345678",
      }),
    )
  })

  it("falls back to the phone number as the actor label when the name is null", async () => {
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
      findCredentialPasswordByUserId: vi.fn(),
      withTransaction: vi.fn(async (callback) =>
        callback({
          createProfileHistory,
          findCredentialPasswordByUserId: vi.fn(),
          findUserIdByPhoneNumber: vi.fn(),
          updateUserProfile: vi.fn().mockResolvedValue({
            id: "user-1",
            name: null,
            phone: "0612345678",
          }),
        }),
      ),
    }

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: { verify: vi.fn() },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: null,
            phoneNumber: "0612345678",
          },
        }),
      },
    })

    await service.recordPasswordChange(new Headers())

    expect(createProfileHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLabel: "0612345678",
      }),
    )
  })
})

describe("AccountService password-change audit ownership (issue #214)", () => {
  const actor = { id: "user-1", name: "عمارة", phoneNumber: "0612345678" }

  it("resolves the audit actor from the request session", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({ password: { verify: vi.fn() } }),
        api: {
          getSession: vi.fn().mockResolvedValue({ user: actor }),
        },
      },
    )

    await expect(service.resolvePasswordChangeActor(new Headers())).resolves.toEqual(actor)
  })

  it("returns null instead of throwing when the session cannot be resolved", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({ password: { verify: vi.fn() } }),
        api: {
          getSession: vi.fn().mockResolvedValue(null),
        },
      },
    )

    await expect(service.resolvePasswordChangeActor(new Headers())).resolves.toBeNull()
  })

  it("returns null instead of throwing when the session lookup itself rejects", async () => {
    // Pins the try/catch → null branch of resolvePasswordChangeActor: a
    // corrupt cookie / gateway outage must never fail the password change.
    const service = new AccountService(
      { withTransaction: vi.fn(), findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({ password: { verify: vi.fn() } }),
        api: {
          getSession: vi.fn().mockRejectedValue(new Error("bad cookie")),
        },
      },
    )

    await expect(service.resolvePasswordChangeActor(new Headers())).resolves.toBeNull()
  })

  it("records the audit entry for a resolved actor", async () => {
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const service = new AccountService(
      {
        withTransaction: vi.fn(async (callback) =>
          callback({
            createProfileHistory,
            findCredentialPasswordByUserId: vi.fn(),
            findUserIdByPhoneNumber: vi.fn(),
            updateUserProfile: vi.fn(),
          }),
        ),
        findCredentialPasswordByUserId: vi.fn(),
      },
      {
        $context: Promise.resolve({ password: { verify: vi.fn() } }),
        api: { getSession: vi.fn() },
      },
    )

    await service.recordPasswordChangeAudit(actor)

    expect(createProfileHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLabel: "عمارة",
        passwordChanged: 1,
      }),
    )
  })

  it("warns and skips the audit when the actor is unavailable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const withTransaction = vi.fn()
    const service = new AccountService(
      { withTransaction, findCredentialPasswordByUserId: vi.fn() },
      {
        $context: Promise.resolve({ password: { verify: vi.fn() } }),
        api: { getSession: vi.fn() },
      },
    )

    await service.recordPasswordChangeAudit(null)

    expect(withTransaction).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      "[auth] Password change succeeded but actor audit context could not be resolved",
    )
    warnSpy.mockRestore()
  })

  it("warns and swallows audit-write failures instead of failing the password change", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const service = new AccountService(
      {
        withTransaction: vi.fn(async () => {
          throw new Error("audit failed")
        }),
        findCredentialPasswordByUserId: vi.fn(),
      },
      {
        $context: Promise.resolve({ password: { verify: vi.fn() } }),
        api: { getSession: vi.fn() },
      },
    )

    await expect(service.recordPasswordChangeAudit(actor)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("AccountService transaction lock window (issue #322)", { timeout: 20000 }, () => {
  // Real Drizzle repo + real shared lock for the invariant tests.
  let rawDb: Database.Database | undefined
  let repository: DrizzleAccountRepository
  let lock: ReturnType<typeof createFifoLock>

  beforeEach(() => {
    rawDb = new Database(":memory:")
    rawDb.pragma("foreign_keys = ON")
    for (const stmt of schemaStatements) {
      rawDb.exec(stmt)
    }
    const now = "2026-01-01T00:00:00.000Z"
    rawDb
      .prepare(
        `INSERT INTO "user" ("id", "name", "phoneNumber", "phoneNumberVerified", "created_at", "updated_at")
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("user-1", "عمارة", "0612345678", 1, now, now)
    rawDb
      .prepare(
        `INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("acct-1", "acct-1", "credential", "user-1", "hashed-password", now, now)

    lock = createFifoLock()
    repository = new DrizzleAccountRepository(createDrizzleFromSqlite(rawDb), lock)
  })

  afterEach(() => {
    rawDb?.close()
    rawDb = undefined
  })

  it("does not hold the connection lock while the current password is being verified", async () => {
    // Real Drizzle repo + real shared lock: proves the phone-change flow
    // verifies the password BEFORE opening the transaction, so a sync
    // writer from another module is never absorbed into an open account
    // transaction during the bcrypt window (~100ms).

    // Gate the bcrypt verify: while it is pending, the lock must be free.
    let releaseVerify!: () => void
    const verifyGate = new Promise<void>((resolve) => {
      releaseVerify = resolve
    })
    const verify = vi
      .fn()
      .mockImplementation(async () => {
        await verifyGate
        return true
      })

    const service = new AccountService(repository, {
      $context: Promise.resolve({
        password: { verify },
      }),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: "user-1", name: "عمارة", phoneNumber: "0612345678" },
        }),
      },
    })

    const pending = service.updateCurrentProfile(new Headers(), {
      phone: "0612345670",
      currentPassword: "correct-password",
    })

    // Wait until the verify is in flight...
    await vi.waitFor(() => {
      expect(verify).toHaveBeenCalledTimes(1)
    })

    // ...then prove a sync writer from another module would NOT be absorbed:
    // the lock is free during the bcrypt window, so runSync executes instead
    // of throwing.
    expect(lock.runSync(() => "free-during-verify")).toBe("free-during-verify")

    releaseVerify()
    const result = await pending
    expect(result.user.phone).toBe("0612345670")

    // The profile row landed (the transaction committed afterwards).
    const row = rawDb!
      .prepare(`SELECT "phoneNumber" FROM "user" WHERE "id" = 'user-1'`)
      .get() as { phoneNumber: string }
    expect(row.phoneNumber).toBe("0612345670")
  })

  it("skips the bcrypt verify entirely for name-only updates", async () => {
    // No phone change → no password verification → no hash read. Pins the
    // early-return guard that keeps bcrypt out of the common profile-edit
    // path (and out of the lock).
    const verify = vi.fn().mockResolvedValue(true)
    const findCredentialPasswordByUserId = vi.fn().mockResolvedValue("hashed-password")

    const service = new AccountService(
      {
        findCredentialPasswordByUserId,
        withTransaction: vi.fn(async (callback) =>
          callback({
            createProfileHistory: vi.fn().mockResolvedValue(undefined),
            findCredentialPasswordByUserId: vi.fn(),
            findUserIdByPhoneNumber: vi.fn(),
            updateUserProfile: vi.fn().mockResolvedValue({
              id: "user-1",
              name: "بلال",
              phone: "0612345678",
            }),
          }),
        ),
      },
      {
        $context: Promise.resolve({
          password: { verify },
        }),
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { id: "user-1", name: "عمارة", phoneNumber: "0612345678" },
          }),
        },
      },
    )

    const result = await service.updateCurrentProfile(new Headers(), {
      name: "بلال",
      phone: "0612345678",
    })
    expect(result.user.name).toBe("بلال")
    expect(verify).not.toHaveBeenCalled()
    expect(findCredentialPasswordByUserId).not.toHaveBeenCalled()
  })
})
