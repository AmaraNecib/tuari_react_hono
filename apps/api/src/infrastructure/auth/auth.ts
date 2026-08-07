import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { bearer, phoneNumber } from "better-auth/plugins";

import type { AppConfig } from "../../config";
import type { AppDrizzle } from "../database/drizzle";

const algerianPhonePattern = /^(05|06|07)\d{8}$/;

/**
 * Create the better-auth instance from a shared Drizzle connection.
 *
 * @param drizzleDb - Shared Drizzle handle; auth shares the same database
 *                    connection as the rest of the app.
 * @param config - Validated app config; supplies the auth base URL, secret,
 *                 and trusted origins.
 */
export function createAuth(drizzleDb: AppDrizzle, config: AppConfig) {
  return betterAuth({
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
      usePlural: false,
    }),
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigins: config.allowedOrigins,
    plugins: [
      bearer(),
      phoneNumber({
        phoneNumberValidator: async (phoneNumberValue) =>
          algerianPhonePattern.test(phoneNumberValue),
        // Security (#283): OTP delivery is intentionally NOT implemented. The
        // `sendOTP` callback is a hard failure instead of the old placeholder
        // that logged to stdout — a real delivery provider must be added here
        // before OTP sign-in is enabled. As wired, OTP values can never reach
        // `%APPDATA%/Tuari/logs/api-server.log`.
        sendOTP: () => {
          throw new Error(
            "OTP delivery is not configured — refusing to send or log OTP codes (see #283)",
          );
        },
      }),
    ],
  });
}

/** Type of the better-auth instance created by createAuth. */
export type BetterAuthInstance = ReturnType<typeof createAuth>;
