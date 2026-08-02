import type { ZodIssue } from "zod";

import {
  authBootstrapInputSchema,
  type AuthBootstrapInput,
  type SessionUser,
} from "@tuari/contracts";

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
        code: "CONFLICT" | "UNAUTHORIZED" | "VALIDATION";
        message: string;
        fieldErrors: Array<{ field: string; message: string }>;
      };
    };

const BOOTSTRAP_CONFLICT_MESSAGE = "تم إعداد الحساب الأول بالفعل.";
const BOOTSTRAP_SECRET_MESSAGE = "رمز الإعداد الأول غير صحيح.";
const BOOTSTRAP_VALIDATION_MESSAGE = "تحقق من صحة بيانات الإعداد.";

/** Per-field Arabic messages for invalid bootstrap input (defense-in-depth). */
const BOOTSTRAP_FIELD_REQUIRED_MESSAGE: Record<string, string> = {
  name: "الاسم مطلوب.",
  password: "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
  setupSecret: "رمز الإعداد الأول مطلوب.",
};

const BOOTSTRAP_FIELD_INVALID_MESSAGE: Record<string, string> = {
  name: "الاسم يجب ألا يتجاوز 120 حرفًا.",
  phone: "رقم الهاتف يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام.",
  password: "كلمة المرور يجب ألا تتجاوز 128 حرفًا.",
  setupSecret: "رمز الإعداد الأول غير صالح.",
};

/** Map a schema issue to a user-facing Arabic field error. */
function bootstrapFieldErrorMessage(issue: ZodIssue): string {
  const field = String(issue.path[0] ?? "input");
  if (issue.code === "too_small") {
    return BOOTSTRAP_FIELD_REQUIRED_MESSAGE[field] ?? BOOTSTRAP_VALIDATION_MESSAGE;
  }
  return BOOTSTRAP_FIELD_INVALID_MESSAGE[field] ?? BOOTSTRAP_VALIDATION_MESSAGE;
}

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
    // Defense-in-depth: the RPC wire gate validates `authBootstrapInputSchema`
    // first, but the service must not trust callers it cannot see. Reject
    // malformed input (blank/whitespace phone, empty/short password, empty
    // name, ...) before hashing or touching the port. `parsed.data` is the
    // schema-normalized input (name/phone already trimmed).
    const parsed = authBootstrapInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION",
          message: BOOTSTRAP_VALIDATION_MESSAGE,
          fieldErrors: parsed.error.issues.map((issue) => ({
            field: String(issue.path[0] ?? "input"),
            message: bootstrapFieldErrorMessage(issue),
          })),
        },
      } satisfies BootstrapResult;
    }

    const data = parsed.data;

    if (this.bootstrapSetupKey && data.setupSecret !== this.bootstrapSetupKey) {
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
    const passwordHash = await context.password.hash(data.password);

    const result = await this.port.createFirstUser({
      name: data.name,
      phone: data.phone,
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
