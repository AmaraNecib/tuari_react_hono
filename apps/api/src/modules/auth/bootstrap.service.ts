import crypto from "node:crypto";

import { eq, count, sql } from "drizzle-orm";
import type { AuthBootstrapInput, SessionUser } from "@tuari/contracts";

import type { AppDrizzle } from "../../infrastructure/database/drizzle";
import { user, account, appBootstrapState } from "../../schema";
import type { BetterAuthInstance } from "../../infrastructure/auth/auth";

type AuthSetupStatus = {
  hasUsers: boolean;
  requiresSetupKey: boolean;
};

type BootstrapResult =
  | {
      success: true;
      message: string;
      item: SessionUser;
    }
  | {
      success: false;
      error: {
        code: "CONFLICT" | "UNAUTHORIZED";
        message: string;
        fieldErrors: Array<{ field: string; message: string }>;
      };
    };

const BOOTSTRAP_CONFLICT_MESSAGE = "تم إعداد الحساب الأول بالفعل.";
const BOOTSTRAP_SECRET_MESSAGE = "رمز الإعداد الأول غير صحيح.";

/** Check if an error is a SQLite UNIQUE constraint violation. */
function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

/**
 * Handles first-user bootstrap and bootstrap state queries.
 * Uses Drizzle ORM for database operations.
 */
/** First-user bootstrap service — creates initial admin account and checks setup state. */
export class AuthBootstrapService {
  constructor(
    private readonly db: AppDrizzle,
    private readonly raw: { exec: (sql: string) => void },
    private readonly authInstance: BetterAuthInstance,
    private readonly bootstrapSetupKey: string | null,
  ) {}

  /** Check whether the first user has already been configured. */
  async getSetupStatus(): Promise<AuthSetupStatus> {
    return {
      hasUsers: await this.hasConfiguredUsers(),
      requiresSetupKey: Boolean(this.bootstrapSetupKey),
    };
  }

  /** Create the first user account (admin) with phone credentials. */
  async bootstrapFirstUser(input: AuthBootstrapInput): Promise<BootstrapResult> {
    if (this.bootstrapSetupKey && input.setupSecret?.trim() !== this.bootstrapSetupKey) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: BOOTSTRAP_SECRET_MESSAGE,
          fieldErrors: [{ field: "setupSecret", message: BOOTSTRAP_SECRET_MESSAGE }],
        },
      };
    }

    const context = await this.authInstance.$context;
    const passwordHash = await context.password.hash(input.password);

    try {
      // Use raw SQLite transaction (synchronous) — Drizzle's db.transaction()
      // doesn't support async callbacks with better-sqlite3.
      let result: BootstrapResult | undefined;
      this.raw.exec("BEGIN");
      try {
        if (await this.hasConfiguredUsersTx(this.db)) {
          result = this.toConflictResult();
        } else {
          const timestamp = new Date().toISOString();
          const userId = crypto.randomUUID();

          this.db
            .insert(appBootstrapState)
            .values({
              singleton: 1,
              createdAt: timestamp,
              userId,
            })
            .run();

          this.db.insert(user).values({
            id: userId,
            name: input.name.trim(),
            phoneNumber: input.phone,
            phoneNumberVerified: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          }).run();

          this.db.insert(account).values({
            id: crypto.randomUUID(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: passwordHash,
            createdAt: timestamp,
            updatedAt: timestamp,
          }).run();

          result = {
            success: true,
            message: "تم إنشاء أول مستخدم بنجاح.",
            item: {
              id: userId,
              name: input.name.trim(),
              phone: input.phone,
            },
          } satisfies BootstrapResult;
        }
        this.raw.exec("COMMIT");
        return result!;
      } catch (err) {
        this.raw.exec("ROLLBACK");
        throw err;
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return this.toConflictResult();
      }

      throw error;
    }
  }

  /** Check if a user is the bootstrap owner (first user). */
  async isBootstrapOwner(userId: string): Promise<boolean> {
    const stateRows = await this.db
      .select({ userId: appBootstrapState.userId })
      .from(appBootstrapState)
      .where(eq(appBootstrapState.singleton, 1))
      .limit(1);

    if (stateRows[0]?.userId) {
      return stateRows[0].userId === userId;
    }

    const firstUser = await this.db
      .select({ id: user.id })
      .from(user)
      .orderBy(user.createdAt)
      .limit(1);

    return firstUser[0]?.id === userId;
  }

  /** Check if any users with valid phone numbers exist. */
  private async hasConfiguredUsers(): Promise<boolean> {
    const userCount = await this.db
      .select({ count: count() })
      .from(user)
      .where(sql`${user.phoneNumber} IS NOT NULL AND TRIM(${user.phoneNumber}) != ''`);

    const stateCount = await this.db
      .select({ count: count() })
      .from(appBootstrapState)
      .where(eq(appBootstrapState.singleton, 1));

    return (userCount[0]?.count ?? 0) > 0 || (stateCount[0]?.count ?? 0) > 0;
  }

  /** Check if any users exist within a transaction context. */
  private async hasConfiguredUsersTx(
    tx: AppDrizzle,
  ): Promise<boolean> {
    const userCount = await tx
      .select({ count: count() })
      .from(user)
      .where(sql`${user.phoneNumber} IS NOT NULL AND TRIM(${user.phoneNumber}) != ''`);

    const stateCount = await tx
      .select({ count: count() })
      .from(appBootstrapState)
      .where(eq(appBootstrapState.singleton, 1));

    return (userCount[0]?.count ?? 0) > 0 || (stateCount[0]?.count ?? 0) > 0;
  }

  /** Build a conflict result for bootstrap errors. */
  private toConflictResult(): BootstrapResult {
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: BOOTSTRAP_CONFLICT_MESSAGE,
        fieldErrors: [{ field: "phone", message: BOOTSTRAP_CONFLICT_MESSAGE }],
      },
    };
  }
}
