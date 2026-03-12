import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "../infrastructure/config/env";
import type { AppDependencies } from "./dependencies";
import { createRouter } from "../rpc/router";
import { createRpcContext } from "../rpc/context";

const isAllowedOrigin = (origin: string | undefined) => {
  if (!origin) {
    return true;
  }

  return env.allowedOrigins.includes(origin);
};

const resolveCorsOrigin = (origin: string | undefined) => {
  if (!origin) {
    return env.allowedOrigins[0] ?? "http://localhost:1420";
  }

  return isAllowedOrigin(origin)
    ? origin
    : env.allowedOrigins[0] ?? "http://localhost:1420";
};

export function createApp(dependencies: AppDependencies) {
  const app = new Hono();
  const router = createRouter({ todoService: dependencies.todoService });
  const rpcHandler = new RPCHandler(router, {
    interceptors: [
      onError((error) => {
        console.error("[oRPC error]", error);
      }),
    ],
  });

  app.use(
    "*",
    cors({
      origin: resolveCorsOrigin,
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
    if (!isAllowedOrigin(c.req.header("origin"))) {
      return c.json({ message: "Blocked origin." }, 403);
    }

    await next();
  });

  app.use("/rpc/*", async (c, next) => {
    if (!isAllowedOrigin(c.req.header("origin"))) {
      return c.json({ message: "Blocked origin." }, 403);
    }

    if (c.req.header("x-tuari-client-key") !== env.appClientKey) {
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
