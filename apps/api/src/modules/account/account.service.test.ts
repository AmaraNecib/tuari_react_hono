import { describe, expect, it, vi } from "vitest"

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
      { withTransaction: vi.fn() },
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
      { withTransaction: vi.fn() },
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

  it("rejects names that trim to empty", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn() },
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
      { withTransaction: vi.fn() },
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
      { withTransaction: vi.fn() },
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

  it("rejects the update when the session user has no phone number", async () => {
    const service = new AccountService(
      { withTransaction: vi.fn() },
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
    const updateUserProfile = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "عمارة",
      phone: "0612345670",
    })
    const createProfileHistory = vi.fn().mockResolvedValue(undefined)
    const repository: AccountRepository = {
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
    expect(updateUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "0612345670" }),
    )
  })

  it("rejects a phone change when no credential password is on record", async () => {
    const repository: AccountRepository = {
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
