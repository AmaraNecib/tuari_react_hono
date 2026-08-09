import { describe, expect, it, vi } from "vitest";

import { appConfigSchema } from "../../config";
import { createAuth } from "./auth";

function buildConfig() {
  return appConfigSchema.parse({
    dbAdapter: "sqlite",
    databasePath: ":memory:",
    databaseUrl: "file::memory:",
    attachmentsRootPath: "./private/invoices",
    host: "127.0.0.1",
    port: 4318,
    allowedOrigins: ["http://localhost:3000"],
    trustProxyHeaders: false,
    betterAuthSecret: "test-secret-0123456789abcdef-0123456789abcdef",
    betterAuthUrl: "http://127.0.0.1:4318",
    bootstrapSetupKey: null,
  });
}

describe("createAuth", () => {
  it("builds the auth instance without logging phone verification info", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      const auth = createAuth({} as never, buildConfig());

      expect(auth).toBeDefined();
      expect(typeof auth.handler).toBe("function");
      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("never delivers OTP codes: send-otp refuses without logging anything", async () => {
    // Real auth instance over a real in-memory database: the send-otp route
    // generates a code and then calls `sendOTP`, which must refuse loudly
    // instead of printing the code to stdout (the pre-#283 placeholder logged
    // phone-verification events).
    const { createAppDependencies } = await import("../../app/dependencies");
    const config = appConfigSchema.parse({
      ...buildConfig(),
      betterAuthUrl: "http://127.0.0.1:9999",
    });
    const deps = await createAppDependencies({ databasePath: ":memory:" }, config);

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await expect(
        deps.auth.api.sendPhoneNumberOTP({
          body: { phoneNumber: "0555000001" },
          headers: new Headers(),
        }),
      ).rejects.toThrow(/OTP delivery is not configured/);

      expect(infoSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
      logSpy.mockRestore();
      deps.close();
    }
  }, 60_000);

  it("keeps password-based phone sign-in wired for the login flow", () => {
    const auth = createAuth({} as never, buildConfig());

    expect(typeof auth.api.signInPhoneNumber).toBe("function");
  });
});
