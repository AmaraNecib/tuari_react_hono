import { describe, expect, it } from "vitest";

import { createEnv } from "./env";

describe("createEnv", () => {
  it("rejects invalid API_PORT values", () => {
    expect(() =>
      createEnv({
        API_PORT: "abc",
        BETTER_AUTH_SECRET: "better-auth-secret",
      }),
    ).toThrow('API_PORT must be a positive integer');
  });

  it("requires BETTER_AUTH_SECRET", () => {
    expect(() => createEnv({})).toThrow("BETTER_AUTH_SECRET is required");
  });

  it("normalizes and deduplicates allowed origins", () => {
    const env = createEnv({
      ALLOWED_ORIGINS: "https://example.com/, https://example.com, http://localhost:3000/",
      BETTER_AUTH_SECRET: "better-auth-secret",
    });

    expect(env.allowedOrigins).toEqual(["https://example.com", "http://localhost:3000"]);
  });

  it("rejects invalid origin values", () => {
    expect(() =>
      createEnv({
        ALLOWED_ORIGINS: "not-a-url",
        BETTER_AUTH_SECRET: "better-auth-secret",
      }),
    ).toThrow("Invalid origin URL");
  });

  it("normalizes BETTER_AUTH_URL by trimming trailing slashes", () => {
    const env = createEnv({
      BETTER_AUTH_SECRET: "better-auth-secret",
      BETTER_AUTH_URL: "https://api.example.com///",
    });

    expect(env.betterAuthUrl).toBe("https://api.example.com");
  });

  it("rejects insecure non-local BETTER_AUTH_URL values", () => {
    expect(() =>
      createEnv({
        BETTER_AUTH_SECRET: "better-auth-secret",
        BETTER_AUTH_URL: "http://api.example.com",
      }),
    ).toThrow("BETTER_AUTH_URL must use https for non-local hosts");
  });

  it("accepts http for any loopback /8 address, not just 127.0.0.1", () => {
    const env = createEnv({
      BETTER_AUTH_SECRET: "better-auth-secret",
      BETTER_AUTH_URL: "http://127.0.0.2:4318",
    });

    expect(env.betterAuthUrl).toBe("http://127.0.0.2:4318");
  });

  it("treats an empty-string BETTER_AUTH_URL as unset and defaults it", () => {
    const env = createEnv({
      BETTER_AUTH_SECRET: "better-auth-secret",
      BETTER_AUTH_URL: "",
    });

    expect(env.betterAuthUrl).toBe("http://127.0.0.1:4318");
  });

  it("rejects BETTER_AUTH_URL values with credentials or query parts", () => {
    expect(() =>
      createEnv({
        BETTER_AUTH_SECRET: "better-auth-secret",
        BETTER_AUTH_URL: "https://user:pass@example.com?x=1",
      }),
    ).toThrow("BETTER_AUTH_URL must not include credentials, query parameters, or fragments");
  });
});
