import crypto from "node:crypto"

import type { AuthBootstrapInput, SessionUser } from "@tuari/contracts"
import type { PrismaClient } from "@prisma/client"

import type { auth } from "../../infrastructure/auth/auth"

type BetterAuthInstance = typeof auth

type AuthSetupStatus = {
  hasUsers: boolean
  requiresSetupKey: boolean
}

type BootstrapResult =
  | {
      success: true
      message: string
      item: SessionUser
    }
  | {
      success: false
      error: {
        code: "CONFLICT" | "UNAUTHORIZED"
        message: string
        fieldErrors: Array<{ field: string; message: string }>
      }
    }

type RawQueryClient = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe"> & {
  user: PrismaClient["user"]
  account: PrismaClient["account"]
}

const BOOTSTRAP_CONFLICT_MESSAGE = "تم إعداد الحساب الأول بالفعل."
const BOOTSTRAP_SECRET_MESSAGE = "رمز الإعداد الأول غير صحيح."

function toCount(value: unknown) {
  if (typeof value === "bigint") {
    return Number(value)
  }

  if (typeof value === "number") {
    return value
  }

  return 0
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && /unique|constraint/i.test(error.message)
}

export class AuthBootstrapService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly authInstance: BetterAuthInstance,
    private readonly bootstrapSetupKey: string | null,
  ) {}

  async getSetupStatus(): Promise<AuthSetupStatus> {
    return {
      hasUsers: await this.hasConfiguredUsers(this.prisma),
      requiresSetupKey: Boolean(this.bootstrapSetupKey),
    }
  }

  async bootstrapFirstUser(input: AuthBootstrapInput): Promise<BootstrapResult> {
    if (this.bootstrapSetupKey && input.setupSecret?.trim() !== this.bootstrapSetupKey) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: BOOTSTRAP_SECRET_MESSAGE,
          fieldErrors: [{ field: "setupSecret", message: BOOTSTRAP_SECRET_MESSAGE }],
        },
      }
    }

    const context = await this.authInstance.$context
    const passwordHash = await context.password.hash(input.password)

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await this.hasConfiguredUsers(tx)) {
          return this.toConflictResult()
        }

        const timestamp = new Date()
        const userId = crypto.randomUUID()

        await tx.$executeRawUnsafe(
          'INSERT INTO "app_bootstrap_state" ("singleton", "created_at", "user_id") VALUES (1, ?, ?)',
          timestamp.toISOString(),
          userId,
        )

        const user = await tx.user.create({
          data: {
            id: userId,
            name: input.name.trim(),
            phoneNumber: input.phone,
            phoneNumberVerified: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        })

        await tx.account.create({
          data: {
            id: crypto.randomUUID(),
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: passwordHash,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        })

        return {
          success: true,
          message: "تم إنشاء أول مستخدم بنجاح.",
          item: {
            id: user.id,
            name: user.name,
            phone: user.phoneNumber,
          },
        } satisfies BootstrapResult
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return this.toConflictResult()
      }

      throw error
    }
  }

  async isBootstrapOwner(userId: string): Promise<boolean> {
    const [stateRow] = await this.prisma.$queryRawUnsafe<Array<{ user_id: string | null }>>(
      'SELECT "user_id" FROM "app_bootstrap_state" WHERE "singleton" = 1 LIMIT 1',
    )

    if (stateRow?.user_id) {
      return stateRow.user_id === userId
    }

    const firstUser = await this.prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })

    return firstUser?.id === userId
  }

  private async hasConfiguredUsers(db: Pick<RawQueryClient, "$queryRawUnsafe">): Promise<boolean> {
    const [userRow] = await db.$queryRawUnsafe<Array<{ count: number | bigint }>>(
      `SELECT COUNT(*) as count FROM "user" WHERE "phoneNumber" IS NOT NULL AND TRIM("phoneNumber") != ''`,
    )
    const [stateRow] = await db.$queryRawUnsafe<Array<{ count: number | bigint }>>(
      'SELECT COUNT(*) as count FROM "app_bootstrap_state" WHERE "singleton" = 1',
    )

    return toCount(userRow?.count) > 0 || toCount(stateRow?.count) > 0
  }

  private toConflictResult(): BootstrapResult {
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: BOOTSTRAP_CONFLICT_MESSAGE,
        fieldErrors: [{ field: "phone", message: BOOTSTRAP_CONFLICT_MESSAGE }],
      },
    }
  }
}
