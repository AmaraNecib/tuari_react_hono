import { describe, expect, it, vi } from "vitest";

import { appConfigSchema } from "../../config";
import { createAuth } from "./auth";

function buildConfig() {
  return appConfigSchema.parse({
    dbAdapter: "sqlite",
    databasePath: ":memory:",
    databaseUrl: "file::memory:",
    attachmentsRootPath: "./private/invoices",
    backupsRootPath: "./private/backups",
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

  it("refuses to send an OTP for a phone number that fails the Algerian-format validator", async () => {
    // Deferred branch from #212: phoneNumberValidator's return-false path. An
    // invalid-format number must be rejected BEFORE sendOTP runs — the error is
    // better-auth's "Invalid phone number" (validator gate), not the "OTP delivery
    // is not configured" sendOTP hard-fail. The validator rejects before any DB
    // access, so the fake db (`{} as never`) is sufficient here.
    const auth = createAuth({} as never, buildConfig());

    await expect(
      auth.api.sendPhoneNumberOTP({
        body: { phoneNumber: "0999123456" },
        headers: new Headers(),
      }),
    ).rejects.toThrow(/Invalid phone number/);
  });

  it("refuses password sign-in for a phone number that fails the Algerian-format validator", async () => {
    // Validator false at the sign-in seam: the number is rejected before the user
    // row is even looked up, so no DB is needed. Pins the same #212-deferred branch
    // through the sign-in route.
    const auth = createAuth({} as never, buildConfig());

    await expect(
      auth.api.signInPhoneNumber({
        body: { phoneNumber: "0999123456", password: "whatever" },
        headers: new Headers(),
      }),
    ).rejects.toThrow(/Invalid phone number/);
  });

  it("accepts all Algerian phone prefixes (05/06/07) and still refuses OTP delivery", async () => {
    // Pins the phoneNumberValidator's true path for EVERY regex arm: the only
    // blocker after a valid 05/06/07 number is the deliberate sendOTP hard-fail,
    // never a spurious validation rejection. Real dependency graph + real in-memory
    // DB are required because a valid number proceeds past the validator to the
    // verification store before sendOTP throws.
    const { createAppDependencies } = await import("../../app/dependencies");
    const config = appConfigSchema.parse({
      ...buildConfig(),
      betterAuthUrl: "http://127.0.0.1:9999",
    });
    const deps = await createAppDependencies({ databasePath: ":memory:" }, config);

    try {
      for (const phoneNumber of ["0555000001", "0666000001", "0777000001"]) {
        await expect(
          deps.auth.api.sendPhoneNumberOTP({
            body: { phoneNumber },
            headers: new Headers(),
          }),
        ).rejects.toThrow(/OTP delivery is not configured/);
      }
    } finally {
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
