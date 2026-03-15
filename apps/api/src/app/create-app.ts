import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppDependencies } from "./dependencies";
import { createRouter } from "../rpc/router";
import { createRpcContext } from "../rpc/context";

export type TransportSecurityConfig = {
  allowedOrigins: readonly string[];
  appClientKey: string;
};

export const createTransportSecurity = (config: TransportSecurityConfig) => {
  const isAllowedOrigin = (origin: string | undefined) => {
    if (!origin) {
      return false;
    }

    return config.allowedOrigins.includes(origin);
  };

  const resolveCorsOrigin = (origin: string | undefined) => {
    if (!origin) {
      return "";
    }

    return isAllowedOrigin(origin) ? origin : "";
  };

  const hasValidClientKey = (clientKey: string | undefined) => {
    if (!clientKey) {
      return false;
    }

    return clientKey === config.appClientKey;
  };

  return {
    isAllowedOrigin,
    resolveCorsOrigin,
    hasValidClientKey,
  };
};

export function createApp(
  dependencies: AppDependencies,
  transportSecurity: TransportSecurityConfig,
) {
  const app = new Hono();
  const router = createRouter(dependencies);
  const transport = createTransportSecurity(transportSecurity);
  const rpcHandler = new RPCHandler(router, {
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
    c.header("Referrer-Policy", "same-origin");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  });

  app.use(
    "*",
    cors({
      origin: transport.resolveCorsOrigin,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Tuari-Client-Key",
        "X-Requested-With",
      ],
      credentials: true,
      maxAge: 600,
    }),
  );

  app.use("/api/auth/*", async (c, next) => {
    if (!transport.isAllowedOrigin(c.req.header("origin"))) {
      return c.json({ message: "Blocked origin." }, 403);
    }

    await next();
  });

  app.use("/rpc/*", async (c, next) => {
    if (!transport.isAllowedOrigin(c.req.header("origin"))) {
      return c.json({ message: "Blocked origin." }, 403);
    }

    if (!transport.hasValidClientKey(c.req.header("x-tuari-client-key"))) {
      return c.json({ message: "Blocked client." }, 403);
    }

    await next();
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.on(["POST", "GET"], "/api/auth/*", (c) => {
    return dependencies.auth.handler(c.req.raw);
  });

  app.use("/rpc/*", async (c, next) => {
    const context = createRpcContext(c.req.raw.headers, dependencies.sessionService);
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
