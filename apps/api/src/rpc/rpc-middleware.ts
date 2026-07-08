import { ORPCError } from "@orpc/server";
import type { AppError, Edition, LicensedFeature } from "@tuari/contracts";

import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { Permission } from "../modules/rbac/permissions";
import { InputValidator } from "../infrastructure/validation/input-validator";
import { SlidingWindowRateLimiter, resolveClientIp } from "../infrastructure/rate-limiter";
import { getLicenseInfo, meetsMinEdition, editionToMinEdition } from "../infrastructure/license";
import { requireCurrentUser, type RpcContext } from "./context";

// Generic schema interface for validation
export interface ValidatorSchema {
  parse(input: unknown): unknown;
  parseAsync(input: unknown): Promise<unknown>;
}

export type MutationAuditContext = {
  actorUserId: string;
  actorLabel: string;
  transactionId: string;
};

type RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "isBootstrapOwner">;
};

export type RpcMiddleware = ReturnType<typeof createRpcMiddleware>;

export function createRpcMiddleware(dependencies: RouterDependencies) {
  // Initialize rate limiter: 100 requests per 15 minutes per user
  const rateLimiter = new SlidingWindowRateLimiter(100, 15 * 60 * 1000);
  rateLimiter.startCleanup();

  // Generate unique key for rate limiting (based on user ID or IP)
  function getRateLimitKey(context: RpcContext): string {
    try {
      const forwardedFor = context.headers.get("x-forwarded-for") as string | undefined;
      const realIp = context.headers.get("x-real-ip") as string | undefined;

      const ip = resolveClientIp({
        forwardedFor,
        realIp,
        remoteAddress: undefined,
        trustProxyHeaders: true,
      });
      return `ip:${ip}`;
    } catch {
      return "ip:unknown";
    }
  }

  function checkRateLimit(context: RpcContext): void {
    const key = getRateLimitKey(context);
    if (!rateLimiter.allow(key)) {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "Too many requests. Please try again later.",
      });
    }
  }

  async function requireWorkspaceAdmin(context: RpcContext) {
    const currentUser = await requireCurrentUser(context);

    if (!(await dependencies.authBootstrapService.isBootstrapOwner(currentUser.id))) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي.",
      });
    }

    return currentUser;
  }

  // Auth-only: checks that the user is logged in but does NOT
  // require bootstrap-admin status. Used by RBAC-protected handlers.
  async function requireAuthenticatedUser(context: RpcContext) {
    return await requireCurrentUser(context);
  }

  async function createAuditContextForUser(context: RpcContext): Promise<MutationAuditContext> {
    const currentUser = await requireAuthenticatedUser(context);
    return {
      actorUserId: currentUser.id,
      actorLabel: currentUser.name ?? currentUser.phone,
      transactionId: crypto.randomUUID(),
    };
  }

  async function createMutationAuditContext(context: RpcContext): Promise<MutationAuditContext> {
    const currentUser = await requireWorkspaceAdmin(context);

    return {
      actorUserId: currentUser.id,
      actorLabel: currentUser.name ?? currentUser.phone,
      transactionId: crypto.randomUUID(),
    };
  }

  return {
    queryAuth<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput>,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        await requireWorkspaceAdmin(context);
        return handler({ context, input });
      };
    },

    queryAuthValidated<TInput, TOutput>(
      schema: ValidatorSchema,
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput>,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        await requireWorkspaceAdmin(context);
        const validatedInput = InputValidator.validate<TInput>(input, schema);
        return handler({ context, input: validatedInput });
      };
    },

    mutationAudit<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => any,
    ): (params: { context: RpcContext; input: TInput }) => Promise<any> {
      return async ({ context, input }) => {
        const auditContext = await createMutationAuditContext(context);
        try {
          return handler({ context, input, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },

    mutationAuditValidated<TInput, TOutput>(
      schema: ValidatorSchema,
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => any,
    ): (params: { context: RpcContext; input: TInput }) => Promise<any> {
      return async ({ context, input }) => {
        const auditContext = await createMutationAuditContext(context);
        try {
          const validatedInput = InputValidator.validate<TInput>(input, schema);
          return handler({ context, input: validatedInput, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },

    queryAuthRateLimited<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput>,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        checkRateLimit(context);
        await requireWorkspaceAdmin(context);
        return handler({ context, input });
      };
    },

    mutationAuditRateLimited<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => any,
    ): (params: { context: RpcContext; input: TInput }) => Promise<any> {
      return async ({ context, input }) => {
        checkRateLimit(context);
        const auditContext = await createMutationAuditContext(context);
        try {
          return handler({ context, input, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },

    mutationAuditRateLimitedValidated<TInput, TOutput>(
      schema: ValidatorSchema,
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => any,
    ): (params: { context: RpcContext; input: TInput }) => Promise<any> {
      return async ({ context, input }) => {
        checkRateLimit(context);
        const auditContext = await createMutationAuditContext(context);
        try {
          const validatedInput = InputValidator.validate<TInput>(input, schema);
          return handler({ context, input: validatedInput, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },

    // Auth-only: checks that the user is logged in (no admin check).
    // Used by RBAC-protected handlers where withPermission gates access.
    withAuth<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput> | TOutput,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        await requireAuthenticatedUser(context);
        return handler({ context, input });
      };
    },

    // Audit logging without admin check.
    // Used by RBAC-protected mutation handlers.
    withAudit<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => any,
    ): (params: { context: RpcContext; input: TInput }) => Promise<any> {
      return async ({ context, input }) => {
        const auditContext = await createAuditContextForUser(context);
        try {
          return handler({ context, input, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },

    withPermission<TInput, TOutput>(
      required: Permission | Permission[],
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput> | TOutput,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        const user = await context.resolveCurrentUser();
        if (!user) {
          throw new ORPCError("UNAUTHORIZED");
        }

        const userPermissions = user.permissions ?? [];
        const requiredPermissions = Array.isArray(required) ? required : [required];
        const allowed = requiredPermissions.some((p) => userPermissions.includes(p));

        if (!allowed) {
          throw new ORPCError("FORBIDDEN", {
            message: "ليس لديك صلاحية للقيام بهذا الإجراء.",
          });
        }

        return handler({ context, input });
      };
    },

    // ── License edition gate ──────────────────────────────────
    //
    // Rejects the request when the current license edition is below the
    // required minimum.  This is API-enforced (see §5.3).

    requireEdition<TInput, TOutput>(
      minEdition: Edition,
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput> | TOutput,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        const license = getLicenseInfo();

        if (!meetsMinEdition(license.edition, minEdition)) {
          throw new ORPCError("UPGRADE_REQUIRED", {
            message: `هذه الميزة تتطلب ${minEdition === "enterprise" ? "الإصدار المؤسسي" : "الإصدار الاحترافي"}.`,
            data: { requiredEdition: minEdition },
          });
        }

        return handler({ context, input });
      };
    },

    // ── License feature gate ──────────────────────────────────
    //
    // Rejects the request when the required feature is not present in the
    // current license.  API-enforced (see §5.3).

    requireFeature<TInput, TOutput>(
      feature: LicensedFeature,
      handler: (params: { context: RpcContext; input: TInput }) => Promise<TOutput> | TOutput,
    ): (params: { context: RpcContext; input: TInput }) => Promise<TOutput> {
      return async ({ context, input }) => {
        const license = getLicenseInfo();

        if (!license.features.includes(feature)) {
          const minEdition = editionToMinEdition(feature);
          throw new ORPCError("UPGRADE_REQUIRED", {
            message: `هذه الميزة تتطلب ترقية الإصدار.`,
            data: { requiredEdition: minEdition },
          });
        }

        return handler({ context, input });
      };
    },
  };
}
