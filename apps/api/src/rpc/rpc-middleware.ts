import { ORPCError } from "@orpc/server";
import type { Edition, LicensedFeature } from "@tuari/contracts";

import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { Permission } from "../modules/rbac/permissions";
import { SlidingWindowRateLimiter, resolveClientIp } from "../infrastructure/rate-limiter";
import { getLicenseInfo, meetsMinEdition, editionToMinEdition } from "../infrastructure/license";
import { requireCurrentUser, type RpcContext } from "./context";

export type MutationAuditContext = {
  actorUserId: string;
  actorLabel: string;
  transactionId: string;
};

type RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "isBootstrapOwner">;
  /**
   * When true, `x-forwarded-for` / `x-real-ip` headers are trusted for
   * client-IP resolution (e.g. behind a reverse proxy). Defaults to false:
   * client-supplied headers are spoofable and must not key rate limiting.
   * Mirrors `config.trustProxyHeaders` / `API_TRUST_PROXY_HEADERS`.
   */
  trustProxyHeaders?: boolean;
};

export type RpcMiddleware = ReturnType<typeof createRpcMiddleware>;

export function createRpcMiddleware(dependencies: RouterDependencies) {
  // Initialize rate limiter: 100 requests per 15 minutes per client
  const rateLimiter = new SlidingWindowRateLimiter(100, 15 * 60 * 1000);
  rateLimiter.startCleanup();

  // Generate unique key for rate limiting (based on user ID or IP)
  function getRateLimitKey(context: RpcContext): string {
    try {
      const forwardedFor = context.headers.get("x-forwarded-for") as string | undefined;
      const realIp = context.headers.get("x-real-ip") as string | undefined;

      // When proxy headers are NOT trusted, resolveClientIp ignores
      // x-forwarded-for/x-real-ip entirely and falls back to the transport
      // socket address (context.remoteAddress), so a client rotating the
      // header cannot reset its rate budget. (#283)
      const ip = resolveClientIp({
        forwardedFor,
        realIp,
        remoteAddress: context.remoteAddress,
        trustProxyHeaders: dependencies.trustProxyHeaders ?? false,
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

  /**
   * Shared check: rejects expired licenses.
   *
   * The Rust shell is the primary gate for expiry (it controls whether the
   * sidecar starts at all past the locked phase), but this sidecar guard
   * ensures that even if `TUARI_LICENSE_STATUS` is set to `"expired"` the
   * API does not serve gated operations.
   */
  function requireActiveLicense(license: ReturnType<typeof getLicenseInfo>): void {
    if (license.status === "expired") {
      throw new ORPCError("UPGRADE_REQUIRED", {
        message: "انتهت صلاحية الترخيص. يرجى تجديد الترخيص للوصول إلى هذه الميزة.",
      });
    }
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

    mutationAudit<TInput, TOutput>(
      handler: (params: { context: RpcContext; input: TInput; auditContext: MutationAuditContext }) => TOutput,
      errorResolver: (error: unknown) => unknown,
    ): (params: { context: RpcContext; input: TInput }) => Promise<unknown> {
      return async ({ context, input }) => {
        const auditContext = await createMutationAuditContext(context);
        try {
          return handler({ context, input, auditContext });
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
      errorResolver: (error: unknown) => unknown,
    ): (params: { context: RpcContext; input: TInput }) => Promise<unknown> {
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
      errorResolver: (error: unknown) => unknown,
    ): (params: { context: RpcContext; input: TInput }) => Promise<unknown> {
      return async ({ context, input }) => {
        const auditContext = await createAuditContextForUser(context);
        try {
          return handler({ context, input, auditContext });
        } catch (error) {
          return errorResolver(error);
        }
      };
    },

    /**
     * Permission gate.
     *
     * SEMANTICS: a single permission is required; an ARRAY is **OR** — the
     * user needs ANY of the listed permissions (`some()`). This is NOT AND:
     * to require ALL of several permissions, compose guards explicitly
     * (e.g. chain `withPermission(a, ...)` inside `withPermission(b, ...)`
     * or add an explicit every()-based check). (#283)
     */
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
        await requireAuthenticatedUser(context);

        const license = getLicenseInfo();
        requireActiveLicense(license);

        if (!meetsMinEdition(license.edition, minEdition)) {
          throw new ORPCError("UPGRADE_REQUIRED", {
            message: `هذه الميزة تتطلب ${minEdition === "enterprise" ? "الإصدار المؤسسي" : minEdition === "professional" ? "الإصدار الاحترافي" : "الإصدار القياسي"}.`,
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
        await requireAuthenticatedUser(context);

        const license = getLicenseInfo();
        requireActiveLicense(license);

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
