import { algerianPhoneSchema } from "@tuari/contracts"

import { getLicenseInfo, mutationLicenseRefusalMessage } from "../../infrastructure/license"
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

type CurrentSessionUser = {
  id: string
  name: string | null
  phoneNumber: string
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

  async getCurrentSessionUser(headers: Headers): Promise<CurrentSessionUser> {
    const session = await this.authGateway.api.getSession({ headers })
    if (!session?.user?.id || !session.user.phoneNumber) {
      throw new AccountServiceError("يجب تسجيل الدخول أولًا.", 401)
    }

    return {
      id: session.user.id,
      name: session.user.name ?? null,
      phoneNumber: session.user.phoneNumber,
    }
  }

  async recordPasswordChangeForUser(user: CurrentSessionUser) {
    const timestamp = new Date()

    await this.repository.withTransaction((tx) =>
      tx.createProfileHistory({
        id: crypto.randomUUID(),
        userId: user.id,
        name: null,
        phone: null,
        previousName: null,
        previousPhone: null,
        passwordChanged: 1,
        actorUserId: user.id,
        actorLabel: user.name ?? user.phoneNumber,
        transactionId: crypto.randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    )
  }

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

    const session = await this.getCurrentSessionUser(headers)

    // License policy (PR #389 review): the profile update has its own HTTP route
    // that bypasses the RPC audit wrappers, so the write gate must live here too.
    // It runs AFTER session resolution so an anonymous caller still gets the
    // auth error first (auth → license precedence). The post-expiry `grace`
    // window is read-only, so it is refused here like every other mutation.
    const licenseRefusal = mutationLicenseRefusalMessage(getLicenseInfo().status)
    if (licenseRefusal) {
      throw new AccountServiceError(licenseRefusal, 403)
    }

    const timestamp = new Date()
    const transactionId = crypto.randomUUID()

    // Issue #322: verify the current password BEFORE opening the transaction.
    // bcrypt (~100ms) must not hold the shared-connection lock — while it ran
    // inside the transaction, a sync writer from another module (company,
    // inventory, invoice, ...) would be absorbed into the open transaction
    // and silently rolled back with it. The hash is read unlocked; the phone
    // uniqueness check still runs inside the transaction where it is atomic.
    // verifyPasswordForPhoneChange throws on failure, so reaching the
    // transaction means verification (when required) already succeeded.
    await this.verifyPasswordForPhoneChange(session, phone, currentPassword)

    return this.repository.withTransaction(async (tx) => {
      if (phone && phone !== session.phoneNumber) {
        const existingUserId = await tx.findUserIdByPhoneNumber(phone)

        if (existingUserId && existingUserId !== session.id) {
          throw new AccountServiceError("رقم الهاتف مستخدم بالفعل.", 409)
        }
      }

      const updatedUser = await tx.updateUserProfile({
        id: session.id,
        name,
        phone,
        updatedAt: timestamp,
      })

      await tx.createProfileHistory({
        id: crypto.randomUUID(),
        userId: updatedUser.id,
        name: updatedUser.name,
        phone: updatedUser.phone,
        previousName: session.name,
        previousPhone: session.phoneNumber,
        actorUserId: updatedUser.id,
        actorLabel: session.name ?? session.phoneNumber,
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

  /**
   * Verify the current password when the phone number is being changed.
   * Runs OUTSIDE the transaction (issue #322) so the expensive bcrypt verify
   * never holds the shared-connection lock. Throws the same errors the
   * old in-transaction flow threw; returns normally when no verification is
   * needed (no phone change) or the password is valid.
   */
  private async verifyPasswordForPhoneChange(
    session: CurrentSessionUser,
    phone: string | undefined,
    currentPassword: string | undefined,
  ): Promise<void> {
    if (!phone || phone === session.phoneNumber) {
      return
    }

    if (!currentPassword || currentPassword.trim().length === 0) {
      throw new AccountServiceError("أدخل كلمة المرور الحالية لتغيير رقم الهاتف.", 400)
    }

    const credentialPassword = await this.repository.findCredentialPasswordByUserId(
      session.id,
    )

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
  }

  async recordPasswordChange(headers: Headers) {
    const session = await this.getCurrentSessionUser(headers)
    await this.recordPasswordChangeForUser(session)
  }

  /**
   * Resolve the actor for the password-change audit WITHOUT throwing. Returns
   * null when the request carries no resolvable session — the route then runs
   * the auth change anyway and skips auditing. Issue #214: the audit policy
   * (resolve-or-null) lives in the owning module, not the transport layer.
   */
  async resolvePasswordChangeActor(headers: Headers): Promise<CurrentSessionUser | null> {
    try {
      return await this.getCurrentSessionUser(headers)
    } catch {
      return null
    }
  }

  /**
   * Record a password-change audit entry for an actor resolved BEFORE the
   * auth handler ran (a successful change may revoke/rotate the session, so
   * the request-time session is the only reliable actor context). Never
   * throws: a missing actor or failed audit write is logged and skipped so
   * the password change itself always succeeds.
   */
  async recordPasswordChangeAudit(actor: CurrentSessionUser | null): Promise<void> {
    if (!actor) {
      console.warn("[auth] Password change succeeded but actor audit context could not be resolved")
      return
    }

    try {
      await this.recordPasswordChangeForUser(actor)
    } catch (error) {
      console.warn("[auth] Password change audit could not be recorded", error)
    }
  }
}
