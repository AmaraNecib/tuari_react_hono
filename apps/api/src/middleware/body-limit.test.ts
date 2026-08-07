import { describe, expect, it, vi } from "vitest";

import { Hono } from "hono";

import {
  bodyLimitMiddleware,
  MAX_JSON_BODY_BYTES,
  MAX_MULTIPART_BODY_BYTES,
  resolveBodyLimitMaxSize,
} from "./body-limit";

const createTestApp = () => {
  const app = new Hono();
  app.use("*", bodyLimitMiddleware);
  app.post("/echo", async (c) => {
    const body = await c.req.text();
    return c.json({ received: body.length });
  });
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
};

// TS DOM `RequestInit` lacks the `duplex` field undici requires for stream bodies.
// Cast through the fetch standard's own type used by @hono/node-server.
const streamRequestInit = (init: RequestInit & { duplex?: "half" }): RequestInit => init;

describe("resolveBodyLimitMaxSize", () => {
  it("returns the multipart cap for multipart/form-data content types", () => {
    expect(resolveBodyLimitMaxSize("multipart/form-data; boundary=----x")).toBe(
      MAX_MULTIPART_BODY_BYTES,
    );
  });

  it("returns the multipart cap case-insensitively", () => {
    expect(resolveBodyLimitMaxSize("Multipart/Form-Data")).toBe(MAX_MULTIPART_BODY_BYTES);
  });

  it("returns the JSON cap for application/json", () => {
    expect(resolveBodyLimitMaxSize("application/json")).toBe(MAX_JSON_BODY_BYTES);
  });

  it("returns the JSON cap for missing content types", () => {
    expect(resolveBodyLimitMaxSize(undefined)).toBe(MAX_JSON_BODY_BYTES);
  });
});

describe("bodyLimitMiddleware", () => {
  it("lets a JSON body at/under the 1 MB cap through", async () => {
    const app = createTestApp();
    const payload = JSON.stringify({ payload: "x".repeat(1024) });
    const response = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: payload.length });
  });

  it("lets a JSON body exactly at the 1 MB cap through", async () => {
    const app = createTestApp();
    const payload = "x".repeat(MAX_JSON_BODY_BYTES);
    const response = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: payload.length });
  });

  it("rejects an oversized JSON body over the cap without invoking the handler", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const app = new Hono();
    app.use("*", bodyLimitMiddleware);
    app.post("/guarded", handler);

    // Explicit content-length forces the header short-circuit path: bodyLimit
    // returns 413 before the downstream handler ever runs.
    const response = await app.request(
      "/guarded",
      streamRequestInit({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(MAX_JSON_BODY_BYTES + 1),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(16));
            controller.close();
          },
        }),
        duplex: "half",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ message: "الطلب كبير جدًا." });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a multipart body over the 30 MB cap via Content-Length without parsing it", async () => {
    const app = createTestApp();
    const response = await app.request(
      "/echo",
      streamRequestInit({
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=----test",
          "content-length": String(MAX_MULTIPART_BODY_BYTES + 1),
        },
        // Deliberately tiny stream body: the Content-Length pre-check must short-circuit
        // with 413 before any byte of the body is consumed.
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(16));
            controller.close();
          },
        }),
        duplex: "half",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ message: "الطلب كبير جدًا." });
  });

  it("rejects an oversized chunked (no Content-Length) body mid-stream with 413", async () => {
    const app = createTestApp();
    const encoder = new TextEncoder();

    const response = await app.request(
      "/echo",
      streamRequestInit({
        method: "POST",
        headers: { "content-type": "application/json" },
        // No Content-Length header: force the stream-counting path with a stream that
        // delivers more than the 1 MB JSON cap in total.
        body: new ReadableStream({
          async start(controller) {
            for (let i = 0; i < 32; i++) {
              controller.enqueue(encoder.encode("x".repeat(64 * 1024)));
            }
            controller.close();
          },
        }),
        duplex: "half",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ message: "الطلب كبير جدًا." });
  });

  it("lets a multipart body under the 30 MB cap through", async () => {
    const app = createTestApp();
    const encoder = new TextEncoder();
    const response = await app.request(
      "/echo",
      streamRequestInit({
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=----test",
          "content-length": String(64 * 1024),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("x".repeat(64 * 1024)));
            controller.close();
          },
        }),
        duplex: "half",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("lets bodyless GET requests through untouched", async () => {
    const app = createTestApp();
    const response = await app.request("/ping", { method: "GET" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
