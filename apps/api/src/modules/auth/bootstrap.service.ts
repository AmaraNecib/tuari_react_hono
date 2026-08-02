import type { AuthBootstrapInput, SessionUser } from "@tuari/contracts";

import type { BetterAuthInstance } from "../../infrastructure/auth/auth";
import { readAppVersion } from "../version";
import type { BootstrapPort } from "./bootstrap.types";

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

/**
 * First-user bootstrap service — creates the initial admin account and checks
 * setup state.
 *
 * Owns the business rules (setup-key validation, password hashing via the auth
 * instance, result shaping); all persistence goes through {@link BootstrapPort}.
 */
export class AuthBootstrapService {
  constructor(
    private readonly port: BootstrapPort,
    private readonly authInstance: BetterAuthInstance,
    private readonly bootstrapSetupKey: string | null,
  ) {}

  /** Check whether the first user has already been configured. */
  async getSetupStatus(): Promise<AuthSetupStatus> {
    return {
      hasUsers: await this.port.hasConfiguredUsers(),
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

    const result = await this.port.createFirstUser({
      name: input.name.trim(),
      phone: input.phone,
      passwordHash,
    });

    if (result.status === "conflict") {
      return this.toConflictResult();
    }

    return {
      success: true,
      message: "تم إنشاء أول مستخدم بنجاح.",
      item: {
        id: result.user.id,
        name: result.user.name,
        phone: result.user.phone,
        version: readAppVersion(),
      },
    } satisfies BootstrapResult;
  }

  /** Check if a user is the bootstrap owner (first user). */
  async isBootstrapOwner(userId: string): Promise<boolean> {
    return this.port.isBootstrapOwner(userId);
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
