import { ORPCError } from "@orpc/server";
import type { Edition, LicensedFeature } from "@tuari/contracts";

import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { Permission } from "../modules/rbac/permissions";
import { SlidingWindowRateLimiter, resolveClientIp } from "../infrastructure/rate-limiter";
import { getLicenseInfo, meetsMinEdition, editionToMinEdition, mutationLicenseRefusalMessage, readLicenseRefusalMessage, type LicenseInfo } from "../infrastructure/license";
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

/**
 * Settle a caught handler error the way its `errorResolver` intends.
 *
 * An `errorResolver` in this codebase returns one of two things:
 *  - a failure OUTPUT (`toFailureResult` → `{ success: false, error }`) that the
 *    procedure's discriminated-union output schema accepts, or
 *  - an `ORPCError` naming the wire error (payment/invoice handlers).
 *
 * The second shape must be THROWN, not returned: a returned `ORPCError` is
 * treated as procedure output and fails output validation, so the client sees
 * `INTERNAL_SERVER_ERROR: Output validation failed` instead of the documented
 * code. This is part of the #421 fix — awaiting the handler only makes the
 * rejection reach the resolver; the resolver's ORPCError must still be thrown
 * to reach the wire.
 */
function settleResolvedError(resolved: unknown): unknown {
  if (resolved instanceof ORPCError) {
    throw resolved;
  }
  return resolved;
}

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
   * Refuses AUDITED MUTATIONS when the license cannot write.
   *
   * The shell reports its status through TUARI_LICENSE_STATUS; this guard is
   * what makes that status binding for the API. Writes require `active` or the
   * post-install `trial` period. The post-expiry `grace` window is READ-ONLY:
   * reads and edition/feature gates still pass, but audited mutations are
   * refused until the license is renewed. Every other status — including an
   * unrecognised value — is refused, so the check fails closed.
   *
   * Callers must authenticate FIRST (see `createMutationAuditContext` and
   * `createAuditContextForUser`), so an anonymous caller gets the usual auth
   * error instead of learning the license state.
   */
  function requireWritableLicense(license: LicenseInfo): void {
    const message = mutationLicenseRefusalMessage(license.status);
    if (message) {
      throw new ORPCError("UPGRADE_REQUIRED", { message });
    }
  }

  /**
   * Read-side gate for edition/feature checks. Same policy as
   * {@link requireWritableLicense}, except the read-only `grace` window is
   * allowed through.
   */
  function requireUsableLicense(license: LicenseInfo): void {
    const message = readLicenseRefusalMessage(license.status);
    if (message) {
      throw new ORPCError("UPGRADE_REQUIRED", { message });
    }
  }

  async function createAuditContextForUser(context: RpcContext): Promise<MutationAuditContext> {
    const currentUser = await requireAuthenticatedUser(context);
    requireWritableLicense(getLicenseInfo());
    return {
      actorUserId: currentUser.id,
      actorLabel: currentUser.name ?? currentUser.phone,
      transactionId: crypto.randomUUID(),
    };
  }

  async function createMutationAuditContext(context: RpcContext): Promise<MutationAuditContext> {
    const currentUser = await requireWorkspaceAdmin(context);
    requireWritableLicense(getLicenseInfo());

    return {
      actorUserId: currentUser.id,
      actorLabel: currentUser.name ?? currentUser.phone,
      transactionId: crypto.randomUUID(),
    };
  }

  return {
    /**
     * Charge one request against the shared per-IP budget for the caller.
     *
     * Used to throttle unauthenticated base-RPC handlers (e.g. `authBootstrap`,
     * which verifies the setup secret) that do not go through the
     * authenticated `*RateLimited` wrappers. Keeps these unauthenticated RPC
     * surfaces on the same spoof-proof socket-keyed budget as the authenticated
     * RPC wrappers (note: the `/api/auth/*` routes use a separately
     * instantiated 30-request limiter, so they are NOT on this shared budget).
     * Throws `TOO_MANY_REQUESTS` when the budget is exhausted.
     */
    rateLimit(context: RpcContext): void {
      checkRateLimit(context);
    },

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
          // `await` so an async handler's rejection settles INSIDE this try:
          // without it the promise escapes the catch and `errorResolver`
          // never runs for any async handler (#421).
          return await handler({ context, input, auditContext });
        } catch (error) {
          return settleResolvedError(errorResolver(error));
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
          // See `mutationAudit`: awaiting keeps the rejection in the catch so
          // `errorResolver` maps async failures too (#421).
          return await handler({ context, input, auditContext });
        } catch (error) {
          return settleResolvedError(errorResolver(error));
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
          // The #421 bug: returning the handler's promise without awaiting let
          // an async rejection escape this catch, so the resolver — and the
          // documented error envelope — never ran for payment/invoice handlers.
          return await handler({ context, input, auditContext });
        } catch (error) {
          return settleResolvedError(errorResolver(error));
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
        requireUsableLicense(license);

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
        requireUsableLicense(license);

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
