import { describe, expect, it } from "vitest";

import { createEnv } from "./env";

describe("createEnv", () => {
  it("rejects invalid API_PORT values", () => {
    expect(() =>
      createEnv({
        API_PORT: "abc",
        APP_CLIENT_KEY: "client-key",
        BETTER_AUTH_SECRET: "better-auth-secret",
      }),
    ).toThrow('API_PORT must be a positive integer');
  });

  it("requires APP_CLIENT_KEY", () => {
    expect(() =>
      createEnv({
        BETTER_AUTH_SECRET: "better-auth-secret",
      }),
    ).toThrow("APP_CLIENT_KEY is required");
  });

  it("requires BETTER_AUTH_SECRET", () => {
    expect(() =>
      createEnv({
        APP_CLIENT_KEY: "client-key",
      }),
    ).toThrow("BETTER_AUTH_SECRET is required");
  });
});
