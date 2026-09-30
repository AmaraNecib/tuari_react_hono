import { ORPCError, onError, onFinish } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppDependencies } from "./dependencies";
import { isLocalHostname, normalizeOrigin } from "../infrastructure/config/url";
import {
  createRpcFailureStore,
  isFailureLogged,
  isRecord,
  logRequestFailure,
  markFailureLogged,
  readResponseBody,
  resolveFailureCode,
  resolveFailureMessage,
  runWithRpcFailureStore,
  unwrapResponseBody,
} from "../infrastructure/observability/request-failure";
import { bodyLimitMiddleware } from "../middleware/body-limit";
import { createOriginBlockingMiddleware } from "../middleware/origin-blocking";
import { resolveClientIp, SlidingWindowRateLimiter } from "../infrastructure/rate-limiter";
import { getLicenseInfo, mutationLicenseRefusalMessage } from "../infrastructure/license";
import { AccountServiceError } from "../modules/account/account.service";
import { InventoryError } from "../modules/inventory/inventory.errors";
import type { InventoryUploadFile } from "../modules/inventory/inventory.types";
import { createRouter } from "../rpc/router";
import { createRpcContext, type RpcContext } from "../rpc/context";

export type TransportSecurityConfig = {
  allowedOrigins: readonly string[];
  trustProxyHeaders?: boolean;
  /**
   * Max requests to /api/auth/* per client IP per 15-min window.
   * Defaults to 30 when unset (production brute-force protection).
   */
  authRateLimitMaxRequests?: number;
};

export const createTransportSecurity = (config: TransportSecurityConfig) => {
  const normalizedAllowedOrigins = new Set(config.allowedOrigins.map(normalizeOrigin));

  const isAllowedOrigin = (origin: string | undefined) => {
    if (!origin) {
      return false;
    }

    try {
      return normalizedAllowedOrigins.has(normalizeOrigin(origin));
    } catch {
      return false;
    }
  };

  const resolveCorsOrigin = (origin: string | undefined) => {
    if (!origin) {
      return "";
    }

    return isAllowedOrigin(origin) ? origin : "";
  };

  return {
    isAllowedOrigin,
    resolveCorsOrigin,
  };
};

function isSecureRequest(url: string, forwardedProto: string | undefined) {
  if (forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https") {
    return true;
  }

  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function isLocalhostHostname(url: string) {
  try {
    return isLocalHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

function shouldDisableCaching(path: string) {
  return path.startsWith("/api/auth/") || path.startsWith("/api/inventory/") || path === "/rpc/session";
}

function getRemoteAddress(env: unknown) {
  const maybeEnv = env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return maybeEnv?.incoming?.socket?.remoteAddress
}

function getAppErrorStatus(code: "VALIDATION" | "UNAUTHORIZED" | "NOT_FOUND" | "CONFLICT" | "BUSINESS_RULE") {
  switch (code) {
    case "UNAUTHORIZED":
      return 401
    case "NOT_FOUND":
      return 404
    case "CONFLICT":
      return 409
    case "VALIDATION":
    case "BUSINESS_RULE":
    default:
      return 400
  }
}

/**
 * The shapes ORPC passes to its request- and procedure-level interceptors.
 * Declared locally because `@orpc/server` does not export the internal
 * option types; the values are cast at the interceptor boundary.
 */
type RpcRequestInfo = { method: string; url: URL }
type RpcResponseInfo = { status: number; body: unknown }
type RpcHandleResult = { matched: boolean; response?: RpcResponseInfo }
type RpcInterceptorOptions = { request: RpcRequestInfo; path?: readonly string[]; context: RpcContext }
type RpcInterceptorState = [unknown, RpcHandleResult | unknown, boolean]

export function createApp(
  dependencies: AppDependencies,
  transportSecurity: TransportSecurityConfig,
) {
  const app = new Hono();
  const router = createRouter(dependencies, {
    trustProxyHeaders: transportSecurity.trustProxyHeaders ?? false,
  });
  const transport = createTransportSecurity(transportSecurity);
  const authRateLimiter = new SlidingWindowRateLimiter(
    transportSecurity.authRateLimitMaxRequests ?? 30,
    15 * 60 * 1000,
  ).startCleanup()
  // The implemented router's concrete type (with `Lazy`-wrapped and
  // `MergedErrorMap` variants) is not directly assignable to the fetch
  // adapter's `Router<any, RpcContext>` parameter; bridge at this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcHandler = new RPCHandler(router as any, {
    interceptors: [
      // Request level: logs a 4xx/5xx response or a `{ success: false }`
      // envelope that no procedure-level interceptor already logged. A
      // wire/decode rejection never reaches the procedure client, so this is
      // the only layer that sees it.
      onFinish((state, options) => {
        const { request } = options as unknown as RpcInterceptorOptions;
        const [, rawResult, isSuccess] = state as unknown as RpcInterceptorState;
        const path = request.url.pathname;

        // A request body ORPC could not decode, or a response it could not
        // encode, never reaches a procedure client. Its accurate status (400
        // for the client's malformed request, 500 for the server's failure) is
        // only known at the transport, where ORPC has already mapped it, so
        // the `/rpc/*` middleware logs those rather than this layer guessing.
        if (!isSuccess) {
          return;
        }

        const result = rawResult as RpcHandleResult;
        if (!result.matched || !result.response) {
          return;
        }

        const { status } = result.response;
        const decoded = unwrapResponseBody(result.response.body);
        const isFailureEnvelope = isRecord(decoded) && decoded.success === false;
        if (status < 400 && !isFailureEnvelope) {
          return;
        }

        if (isFailureLogged()) {
          return;
        }

        logRequestFailure({
          method: request.method,
          path,
          status,
          message: resolveFailureMessage(decoded) ?? `HTTP ${status}`,
          code: resolveFailureCode(decoded),
        });
        markFailureLogged();
      }),
    ],
    clientInterceptors: [
      // Procedure level: the only layer that still holds the original error
      // (ORPC maps unknown errors to a generic 500 envelope before the
      // request-level interceptor sees a response).
      onError((error, options) => {
        const { path = [] } = options as unknown as RpcInterceptorOptions;
        const failure = error instanceof Error ? error : undefined;
        logRequestFailure({
          method: "POST",
          path: `rpc/${path.join(".")}`,
          status: error instanceof ORPCError ? error.status : 500,
          message: failure?.message ?? String(error),
          code: error instanceof ORPCError ? error.code : undefined,
          error: failure,
        });
        markFailureLogged();
      }),
      // Procedure level: a domain failure returned as `{ success: false }` is a
      // 200 at the transport, so it must be logged from the decoded output.
      onFinish((state, options) => {
        const { path = [] } = options as unknown as RpcInterceptorOptions;
        const [, result, isSuccess] = state as unknown as RpcInterceptorState;
        if (!isSuccess || !isRecord(result) || result.success !== false) {
          return;
        }

        logRequestFailure({
          method: "POST",
          path: `rpc/${path.join(".")}`,
          status: 200,
          message: resolveFailureMessage(result) ?? "Procedure returned a failure result",
          code: resolveFailureCode(result),
        });
        markFailureLogged();
      }),
    ],
  });

  // Request-failure logging runs FIRST so it wraps every later middleware and
  // route: an unhandled throw is logged, and any 4xx/5xx ends with one
  // readable line (see infrastructure/observability/request-failure.ts).
  app.use("*", async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    try {
      await next();
    } catch (error) {
      logRequestFailure({
        method,
        path,
        status: 500,
        message: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : undefined,
      });
      throw error;
    }

    const { status } = c.res;
    if (status < 400) {
      return;
    }

    const rawBody = await readResponseBody(c.res);
    // ORPC responses (and error envelopes) are wrapped as `{ json: payload }`;
    // every other route returns its body as-is.
    const body = path.startsWith("/rpc/") ? unwrapResponseBody(rawBody) : rawBody;
    // ORPC request failures were already logged by the interceptors above
    // (they carry the real procedure error). A body-limit 413 bypasses ORPC
    // and is not an ORPC envelope, so it still lands here.
    if (path.startsWith("/rpc/") && isRecord(body) && typeof body.code === "string") {
      return;
    }

    logRequestFailure({
      method,
      path,
      status,
      message: resolveFailureMessage(body) ?? `HTTP ${status}`,
      code: resolveFailureCode(body),
    });
  });

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

    const vary = c.res.headers.get("Vary");
    if (!vary) {
      c.header("Vary", "Origin");
    } else if (!vary.includes("Origin")) {
      c.header("Vary", `${vary}, Origin`);
    }

    if (shouldDisableCaching(c.req.path)) {
      c.header("Cache-Control", "no-store, private");
      c.header("Pragma", "no-cache");
    }

    if (isSecureRequest(c.req.url, c.req.header("x-forwarded-proto")) && !isLocalhostHostname(c.req.url)) {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  app.use(
    "*",
    cors({
      origin: transport.resolveCorsOrigin,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
      ],
      credentials: true,
      maxAge: 600,
    }),
  );

  // Global request-body size guard: 1 MB for JSON/urlencoded, 30 MB for multipart.
  // When a Content-Length is present this rejects with 413 BEFORE the body is read,
  // so multipart uploads are never fully buffered past the cap (defense in depth
  // below the module-owned per-file + total attachment caps).
  app.use("*", bodyLimitMiddleware);

  app.use(
    "/api/auth/*",
    // Auth endpoints allow originless top-level GET/HEAD (browser navigation);
    // every other request must carry an allow-listed Origin.
    // Pass the bound closure so a future this-dependent isAllowedOrigin
    // refactor cannot silently fail closed (issue #214 debate finding).
    createOriginBlockingMiddleware((origin) => transport.isAllowedOrigin(origin), { allowOriginlessSafelist: true }),
  );

  app.use("/api/auth/*", async (c, next) => {
    const ip = resolveClientIp({
      forwardedFor: c.req.header("x-forwarded-for"),
      realIp: c.req.header("x-real-ip"),
      remoteAddress: getRemoteAddress(c.env),
      trustProxyHeaders: transportSecurity.trustProxyHeaders ?? false,
    })

    if (!authRateLimiter.allow(ip)) {
      return c.json({ message: "طلبات كثيرة جدًا. يرجى المحاولة لاحقًا." }, 429)
    }

    await next();
  });

  app.use("/rpc/*", createOriginBlockingMiddleware((origin) => transport.isAllowedOrigin(origin)));

  app.use("/api/inventory/*", createOriginBlockingMiddleware((origin) => transport.isAllowedOrigin(origin)));

  app.get("/health", (c) => c.json({ status: "ok" }));

  // M4.1 — Update metadata endpoint (GET for the Rust updater engine)
  // Intentionally unauthenticated — the updater engine runs locally and
  // does not carry session tokens.  The RPC variant (updateMetadata) uses
  // m.queryAuth for authenticated frontend access.
  app.get("/api/updates/latest", (c) =>
    c.json(dependencies.updateService.getLatestMetadata()),
  );

  app.post("/api/auth/profile", async (c) => {
    const body = await c.req.json().catch(() => null);

    try {
      const result = await dependencies.accountService.updateCurrentProfile(c.req.raw.headers, body ?? {});
      return c.json(result);
    } catch (error) {
      if (error instanceof AccountServiceError) {
        return c.json({ message: error.message }, { status: error.status as 400 | 401 | 403 | 409 });
      }

      throw error;
    }
  });

  app.post("/api/auth/change-password", async (c) => {
    // Resolve the audit actor BEFORE the auth handler runs: a successful
    // password change may revoke/rotate the request's session, so the
    // request-time session is the only reliable actor context. The audit
    // policy (resolve-or-null, warn-and-skip) lives in the account module.
    const actor = await dependencies.accountService.resolvePasswordChangeActor(c.req.raw.headers)

    const response = await dependencies.auth.handler(c.req.raw)

    if (!response.ok) {
      return c.newResponse(response.body, response)
    }

    await dependencies.accountService.recordPasswordChangeAudit(actor)
    return c.newResponse(response.body, response)
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => {
    return dependencies.auth.handler(c.req.raw);
  });

  app.post("/api/inventory/invoice-groups/:invoiceGroupId/attachments", async (c) => {
    try {
      const currentUser = await dependencies.accountService.getCurrentSessionUser(c.req.raw.headers)
      if (!(await dependencies.authBootstrapService.isBootstrapOwner(currentUser.id))) {
        return c.json({ message: "غير مصرح بهذا الإجراء." }, 401)
      }

      // License policy (PR #389 review): this upload route bypasses the RPC
      // audit wrappers, so the write gate must live here too. It runs AFTER the
      // session + bootstrap-owner checks so an anonymous caller gets the auth
      // error first, and it refuses the read-only `grace` window like every
      // other mutation.
      const licenseRefusal = mutationLicenseRefusalMessage(getLicenseInfo().status)
      if (licenseRefusal) {
        return c.json({ success: false, error: { code: "UPGRADE_REQUIRED", message: licenseRefusal } }, 403)
      }

      const { invoiceGroupId } = c.req.param()
      const formData = await c.req.formData()
      const files = formData.getAll("files").filter((value): value is File => value instanceof File)

      // Hand the inventory module metadata + a lazy bytes loader. The module
      // owns the attachment limits AND buffering: it rejects count/size-invalid
      // uploads before reading any byte content (issue #214), so over-limit
      // requests never allocate a byte-array copy here.
      const normalizedFiles: InventoryUploadFile[] = files.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        bytes: () => file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      }))

      const attachments = await dependencies.inventoryService.addInvoiceAttachments(
        invoiceGroupId,
        normalizedFiles,
        {
          actorUserId: currentUser.id,
          actorLabel: currentUser.name ?? currentUser.phoneNumber,
          transactionId: crypto.randomUUID(),
        },
      )

      return c.json({ success: true, items: attachments })
    } catch (error) {
      if (error instanceof AccountServiceError) {
        return c.json({ message: error.message }, error.status as 400 | 401 | 403 | 409)
      }

      if (error instanceof InventoryError) {
        return c.json({ success: false, error: error.appError }, getAppErrorStatus(error.appError.code))
      }

      throw error
    }
  })

  app.get("/api/inventory/attachments/:attachmentId", async (c) => {
    try {
      const currentUser = await dependencies.accountService.getCurrentSessionUser(c.req.raw.headers)
      if (!(await dependencies.authBootstrapService.isBootstrapOwner(currentUser.id))) {
        return c.json({ message: "غير مصرح بهذا الإجراء." }, 401)
      }

      const { attachmentId } = c.req.param()
      const { attachment, body } = await dependencies.inventoryService.getAttachmentDownload(attachmentId)
      c.header("Content-Type", attachment.mimeType)
      c.header("Content-Length", String(attachment.byteSize))
      c.header("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.originalName)}"`)
      return c.body(body)
    } catch (error) {
      if (error instanceof AccountServiceError) {
        return c.json({ message: error.message }, error.status as 400 | 401 | 409)
      }

      if (error instanceof InventoryError) {
        return c.json({ success: false, error: error.appError }, getAppErrorStatus(error.appError.code))
      }

      throw error
    }
  })

  app.use("/rpc/*", async (c, next) => {
    const context = createRpcContext(
      c.req.raw.headers,
      dependencies.sessionService,
      getRemoteAddress(c.env),
    );
    // One marker per request, inherited by every interceptor inside handle.
    const failureStore = createRpcFailureStore();
    const { matched, response } = await runWithRpcFailureStore(
      failureStore,
      () => rpcHandler.handle(c.req.raw, { prefix: "/rpc", context }),
    );

    if (matched) {
      // ORPC maps a request it cannot decode to BAD_REQUEST (400) and a
      // failure on the server side of the response to INTERNAL_SERVER_ERROR
      // (500). Use that mapped status verbatim: never report a malformed
      // request as a server fault, and never hide a real server fault as a
      // client one. Client interceptors already logged thrown procedure
      // errors and `{ success: false }` envelopes, so those are skipped here.
      if (response.status >= 400 && !failureStore.logged) {
        const body = unwrapResponseBody(await readResponseBody(response));
        logRequestFailure({
          method: c.req.method,
          path: c.req.path,
          status: response.status,
          message: resolveFailureMessage(body) ?? `HTTP ${response.status}`,
          code: resolveFailureCode(body),
        });
        failureStore.logged = true;
      }

      return c.newResponse(response.body, response);
    }

    await next();
  });

  app.notFound((c) => c.json({ message: "Route not found" }, 404));

  return app;
}
