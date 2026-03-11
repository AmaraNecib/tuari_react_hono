import { serve } from "@hono/node-server";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth } from "./lib/auth";
import { ensureDatabaseSchema } from "./lib/db";
import { env } from "./lib/env";
import { router } from "./rpc/router";

const app = new Hono();
const rpcHandler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error("[oRPC error]", error);
    }),
  ],
});

const isAllowedOrigin = (origin: string | undefined) => {
  if (!origin) {
    return true;
  }

  return env.allowedOrigins.includes(origin);
};

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return env.allowedOrigins[0] ?? "http://localhost:1420";
      }

      return env.allowedOrigins.includes(origin)
        ? origin
        : env.allowedOrigins[0] ?? "http://localhost:1420";
    },
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
  const origin = c.req.header("origin");

  if (!isAllowedOrigin(origin)) {
    return c.json({ message: "Blocked origin." }, 403);
  }

  await next();
});

app.use("/rpc/*", async (c, next) => {
  const origin = c.req.header("origin");
  const clientKey = c.req.header("x-tuari-client-key");

  if (!isAllowedOrigin(origin)) {
    return c.json({ message: "Blocked origin." }, 403);
  }

  if (clientKey !== env.appClientKey) {
    return c.json({ message: "Blocked client." }, 403);
  }

  await next();
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {
      headers: c.req.raw.headers,
    },
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }

  await next();
});

app.notFound((c) => c.json({ message: "Route not found" }, 404));

async function main() {
  await ensureDatabaseSchema();

  serve(
    {
      fetch: app.fetch,
      port: env.port,
      hostname: env.host,
    },
    (info) => {
      console.log(`API listening on http://${info.address}:${info.port}`);
    },
  );
}

main().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
