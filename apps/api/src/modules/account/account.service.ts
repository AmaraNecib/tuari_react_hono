import { algerianPhoneSchema } from "@tuari/contracts"

import type { AccountRepository } from "./account.repository"

type AuthGateway = {
  $context: Promise<{
    password: {
      verify: (args: { hash: string; password: string }) => Promise<boolean>
    }
  }>
  api: {
    getSession: (args: { headers: Headers }) => Promise<{
      user?: {
        id: string
        name: string | null
        phoneNumber?: string | null
      } | null
    } | null>
  }
}

type ProfileUpdateInput = {
  currentPassword?: string
  name?: string
  phone?: string
}

export class AccountServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "AccountServiceError"
  }
}

export class AccountService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly authGateway: AuthGateway,
  ) {}

  async updateCurrentProfile(headers: Headers, rawInput: ProfileUpdateInput) {
    const currentPassword = typeof rawInput.currentPassword === "string" ? rawInput.currentPassword : undefined
    const name = typeof rawInput.name === "string" ? rawInput.name.trim() : undefined
    const phone = typeof rawInput.phone === "string" ? rawInput.phone.trim() : undefined

    if (!name && !phone) {
      throw new AccountServiceError("أدخل اسمًا أو رقم هاتف واحدًا على الأقل.", 400)
    }

    if (name !== undefined && (name.length < 1 || name.length > 120)) {
      throw new AccountServiceError("يجب أن يكون الاسم بين حرف واحد و120 حرفًا.", 400)
    }

    if (phone !== undefined) {
      const phoneResult = algerianPhoneSchema.safeParse(phone)
      if (!phoneResult.success) {
        throw new AccountServiceError("أدخل رقم هاتف جزائري صالح.", 400)
      }
    }

    const session = await this.authGateway.api.getSession({ headers })
    if (!session?.user?.id || !session.user.phoneNumber) {
      throw new AccountServiceError("يجب تسجيل الدخول أولًا.", 401)
    }

    const timestamp = new Date()
    const transactionId = crypto.randomUUID()

    return this.repository.withTransaction(async (tx) => {
      if (phone && phone !== session.user!.phoneNumber) {
        if (!currentPassword || currentPassword.trim().length === 0) {
          throw new AccountServiceError("أدخل كلمة المرور الحالية لتغيير رقم الهاتف.", 400)
        }

        const credentialPassword = await tx.findCredentialPasswordByUserId(session.user!.id)

        if (!credentialPassword) {
          throw new AccountServiceError("تعذر التحقق من كلمة المرور الحالية.", 400)
        }

        const authContext = await this.authGateway.$context
        const passwordValid = await authContext.password.verify({
          hash: credentialPassword,
          password: currentPassword,
        })

        if (!passwordValid) {
          throw new AccountServiceError("كلمة المرور الحالية غير صحيحة.", 401)
        }

        const existingUserId = await tx.findUserIdByPhoneNumber(phone)

        if (existingUserId && existingUserId !== session.user!.id) {
          throw new AccountServiceError("رقم الهاتف مستخدم بالفعل.", 409)
        }
      }

      const updatedUser = await tx.updateUserProfile({
        id: session.user!.id,
        name,
        phone,
        updatedAt: timestamp,
      })

      await tx.createProfileHistory({
          id: crypto.randomUUID(),
          userId: updatedUser.id,
          name: updatedUser.name,
          phone: updatedUser.phone,
          actorUserId: updatedUser.id,
          actorLabel: updatedUser.name,
          transactionId,
          createdAt: timestamp,
          updatedAt: timestamp,
      })

      return {
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          phone: updatedUser.phone,
        },
      }
    })
  }
}
