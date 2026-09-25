import { describe, expect, it } from "vitest";

import { Hono } from "hono";

import { createOriginBlockingMiddleware } from "./origin-blocking";

const ALLOWED_ORIGIN = "http://allowed.example";

const isAllowedOrigin = (origin: string | undefined) => origin === ALLOWED_ORIGIN;

const createGuardedApp = (options?: { allowOriginlessSafelist?: boolean }) => {
  const app = new Hono();
  app.use("*", createOriginBlockingMiddleware(isAllowedOrigin, options));
  // `all` also covers OPTIONS so the middleware's pass-through (vs the 404)
  // is observable in the fixture.
  app.all("/echo", (c) => c.json({ ok: true }));
  return app;
};

describe("createOriginBlockingMiddleware", () => {
  it("blocks requests from a disallowed origin with 403", async () => {
    const app = createGuardedApp();

    const response = await app.request("http://localhost/echo", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Blocked origin." });
  });

  it("lets requests from an allowed origin through", async () => {
    const app = createGuardedApp();

    const response = await app.request("http://localhost/echo", {
      method: "POST",
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("blocks originless requests when no safelist option is enabled", async () => {
    const app = createGuardedApp();

    const response = await app.request("http://localhost/echo", { method: "GET" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Blocked origin." });
  });

  it("exempts only safe, originless GET/HEAD requests when the safelist is enabled", async () => {
    const app = createGuardedApp({ allowOriginlessSafelist: true });

    const getResponse = await app.request("http://localhost/echo", { method: "GET" });
    expect(getResponse.status).toBe(200);

    const headResponse = await app.request("http://localhost/echo", { method: "HEAD" });
    expect(headResponse.status).toBe(200);

    // A state-changing originless POST is still blocked.
    const postResponse = await app.request("http://localhost/echo", { method: "POST" });
    expect(postResponse.status).toBe(403);
  });

  it("applies the same check to OPTIONS preflight requests", async () => {
    const app = createGuardedApp({ allowOriginlessSafelist: true });

    const allowed = await app.request("http://localhost/echo", {
      method: "OPTIONS",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(allowed.status).toBe(200);

    const blocked = await app.request("http://localhost/echo", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toEqual({ message: "Blocked origin." });
  });

  it("still blocks GET requests carrying a disallowed origin even with the safelist enabled", async () => {
    // Regression pin: the safelist only covers the MISSING-origin case. A GET
    // carrying a disallowed origin must never sneak through just because the
    // method is safe.
    const app = createGuardedApp({ allowOriginlessSafelist: true });

    const response = await app.request("http://localhost/echo", {
      method: "GET",
      headers: { origin: "https://evil.example" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Blocked origin." });
  });
});
