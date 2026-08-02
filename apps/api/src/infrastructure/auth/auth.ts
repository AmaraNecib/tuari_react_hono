import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { bearer, phoneNumber } from "better-auth/plugins";

import type { AppConfig } from "../../config";
import type { AppDrizzle } from "../database/drizzle";

const algerianPhonePattern = /^(05|06|07)\d{8}$/;

/** Create the better-auth instance from a shared Drizzle connection. */
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
        phoneNumberValidator: async (phoneNumberValue) => algerianPhonePattern.test(phoneNumberValue),
        sendOTP: ({ phoneNumber }) => {
          const masked = phoneNumber.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2");
          console.info(`[better-auth] Phone verification requested for ${masked}`);
        },
      }),
    ],
  });
}

/** Type of the better-auth instance created by createAuth. */
export type BetterAuthInstance = ReturnType<typeof createAuth>;
