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
        passwordChanged: true,
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
        passwordChanged: true,
      }),
    )
  })
})
