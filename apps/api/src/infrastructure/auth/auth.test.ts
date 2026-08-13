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

  // #321: a pre-#230 user whose hash was created from an all-invisible
  // password can still sign in — the server verifies the input against the
  // stored hash and has NO visible-character gate on sign-in (better-auth
  // validates `password: z.string()` only). The web client's schema gate is
  // the only blocker, and that is lifted for sign-in in the contracts/web
  // change. This test seeds a real better-auth hash (same scrypt defaults the
  // auth instance verifies with) and pins that the server side of the
  // recovery path works end to end.
  it("verifies a legacy whitespace-password hash at sign-in (#321 recovery)", async () => {
    const { hashPassword } = await import("better-auth/crypto");
    const { createDatabaseConnection } = await import("../../infrastructure/database/factory");
    const { createDrizzleFromSqlite } = await import("../../infrastructure/database/drizzle");
    const { ensureDatabaseSchema } = await import("../../infrastructure/database/schema");
    const { BetterSqlite3Executor } = await import("../../infrastructure/database/sqlite-executor");
    const { user, account } = await import("../../schema");

    const raw = createDatabaseConnection(":memory:");
    try {
      await ensureDatabaseSchema(new BetterSqlite3Executor(raw));
      const db = createDrizzleFromSqlite(raw);
      const auth = createAuth(
        db,
        appConfigSchema.parse({ ...buildConfig(), betterAuthUrl: "http://127.0.0.1:9999" }),
      );

      const legacyPassword = "        ";
      const hash = await hashPassword(legacyPassword);
      const now = new Date().toISOString();
      const userId = "legacy-user-1";

      await db.insert(user).values({
        id: userId,
        name: "مستخدم قديم",
        phoneNumber: "0555000001",
        phoneNumberVerified: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(account).values({
        id: "legacy-account-1",
        accountId: "0555000001",
        providerId: "credential",
        userId,
        password: hash,
        createdAt: now,
        updatedAt: now,
      });

      // The legacy whitespace password matches the stored hash → session issued.
      const signIn = await auth.api.signInPhoneNumber({
        body: { phoneNumber: "0555000001", password: legacyPassword },
        headers: new Headers(),
      });
      expect(signIn.token).toBeTruthy();
      expect(signIn.user.phoneNumber).toBe("0555000001");

      // Any other value still fails — the hash is the only credential.
      await expect(
        auth.api.signInPhoneNumber({
          body: { phoneNumber: "0555000001", password: "         " },
          headers: new Headers(),
        }),
      ).rejects.toThrow();
    } finally {
      raw.close();
    }
  }, 60_000);
});
