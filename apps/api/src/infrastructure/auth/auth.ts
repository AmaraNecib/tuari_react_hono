import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { bearer, phoneNumber } from "better-auth/plugins";

import { env } from "../config/runtime-env";
import type { AppDrizzle } from "../database/drizzle";

const algerianPhonePattern = /^(05|06|07)\d{8}$/;

/**
 * Create the better-auth instance from an existing Drizzle connection.
 * The caller provides the shared Drizzle handle so auth shares the
 * same database connection as the rest of the app.
 */
export function createAuth(drizzleDb: AppDrizzle) {
  return betterAuth({
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
      usePlural: false,
    }),
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret,
    trustedOrigins: env.allowedOrigins,
    plugins: [
      bearer(),
      phoneNumber({
        phoneNumberValidator: async (phoneNumberValue) => algerianPhonePattern.test(phoneNumberValue),
        sendOTP: ({ phoneNumber }) => {
          const masked = phoneNumber.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2");
          console.info(`[better-auth] Phone verification requested for ${masked}`);
        },
      }),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createAuth>;
