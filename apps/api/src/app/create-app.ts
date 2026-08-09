import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppDependencies } from "./dependencies";
import { isLocalHostname, normalizeOrigin } from "../infrastructure/config/url";
import { bodyLimitMiddleware } from "../middleware/body-limit";
import { resolveClientIp, SlidingWindowRateLimiter } from "../infrastructure/rate-limiter";
import { AccountServiceError } from "../modules/account/account.service";
import { InventoryError } from "../modules/inventory/inventory.errors";
import { createRouter } from "../rpc/router";
import { createRpcContext } from "../rpc/context";

export type TransportSecurityConfig = {
  allowedOrigins: readonly string[];
  trustProxyHeaders?: boolean;
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

const MAX_INVOICE_ATTACHMENT_COUNT = 10
const MAX_INVOICE_ATTACHMENT_TOTAL_SIZE = 25 * 1024 * 1024

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

export function createApp(
  dependencies: AppDependencies,
  transportSecurity: TransportSecurityConfig,
) {
  const app = new Hono();
  const router = createRouter(dependencies, {
    trustProxyHeaders: transportSecurity.trustProxyHeaders ?? false,
  });
  const transport = createTransportSecurity(transportSecurity);
  const authRateLimiter = new SlidingWindowRateLimiter(30, 15 * 60 * 1000).startCleanup()
  // The implemented router's concrete type (with `Lazy`-wrapped and
  // `MergedErrorMap` variants) is not directly assignable to the fetch
  // adapter's `Router<any, RpcContext>` parameter; bridge at this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcHandler = new RPCHandler(router as any, {
    interceptors: [
      onError((error) => {
        console.error("[oRPC error]", error);
      }),
    ],
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
  // below the route-level per-file + total attachment caps).
  app.use("*", bodyLimitMiddleware);

  app.use("/api/auth/*", async (c, next) => {
    const origin = c.req.header("origin")
    const isTopLevelSafeAuthRequest = !origin && ["GET", "HEAD"].includes(c.req.method)

    if (!isTopLevelSafeAuthRequest && !transport.isAllowedOrigin(origin)) {
      return c.json({ message: "Blocked origin." }, 403);
    }

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

  app.use("/rpc/*", async (c, next) => {
    if (!transport.isAllowedOrigin(c.req.header("origin"))) {
      return c.json({ message: "Blocked origin." }, 403);
    }

    await next();
  });

  app.use("/api/inventory/*", async (c, next) => {
    if (!transport.isAllowedOrigin(c.req.header("origin"))) {
      return c.json({ message: "Blocked origin." }, 403)
    }

    await next()
  })

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
        return c.json({ message: error.message }, { status: error.status as 400 | 401 | 409 });
      }

      throw error;
    }
  });

  app.post("/api/auth/change-password", async (c) => {
    let actor: Awaited<ReturnType<typeof dependencies.accountService.getCurrentSessionUser>> | null = null

    try {
      actor = await dependencies.accountService.getCurrentSessionUser(c.req.raw.headers)
    } catch {
      actor = null
    }

    const response = await dependencies.auth.handler(c.req.raw)

    if (!response.ok) {
      return c.newResponse(response.body, response)
    }

    if (!actor) {
      console.warn("[auth] Password change succeeded but actor audit context could not be resolved")
      return c.newResponse(response.body, response)
    }

    try {
      await dependencies.accountService.recordPasswordChangeForUser(actor)
    } catch (error) {
      console.warn("[auth] Password change audit could not be recorded", error)
    }

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

      const { invoiceGroupId } = c.req.param()
      const formData = await c.req.formData()
      const files = formData.getAll("files").filter((value): value is File => value instanceof File)

      if (files.length > MAX_INVOICE_ATTACHMENT_COUNT) {
        throw new InventoryError("VALIDATION", "عدد الملفات المرفوعة كبير جدًا.", [
          { field: "files", message: `الحد الأقصى هو ${MAX_INVOICE_ATTACHMENT_COUNT} ملفات لكل فاتورة.` },
        ])
      }

      const totalFileSize = files.reduce((sum, file) => sum + file.size, 0)
      if (totalFileSize > MAX_INVOICE_ATTACHMENT_TOTAL_SIZE) {
        throw new InventoryError("VALIDATION", "إجمالي حجم الملفات كبير جدًا.", [
          { field: "files", message: "يرجى تقليل إجمالي حجم المرفقات قبل الرفع." },
        ])
      }

      const normalizedFiles = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      )

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
        return c.json({ message: error.message }, error.status as 400 | 401 | 409)
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
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: "/rpc",
      context,
    });

    if (matched) {
      return c.newResponse(response.body, response);
    }

    await next();
  });

  app.notFound((c) => c.json({ message: "Route not found" }, 404));

  return app;
}
