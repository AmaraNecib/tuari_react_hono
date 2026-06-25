import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { bearer, phoneNumber } from "better-auth/plugins";

import { env } from "../config/runtime-env";
import { createDatabaseConnection } from "../database/factory";
import { createDrizzleFromSqlite } from "../database/drizzle";

const algerianPhonePattern = /^(05|06|07)\d{8}$/;

// Create connection for better-auth (unencrypted — auth tables don't need SQLCipher)
const sqlite = createDatabaseConnection();
const db = createDrizzleFromSqlite(sqlite);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
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
      sendOTP: ({ phoneNumber: requestedPhoneNumber }) => {
        console.info(`[better-auth] Phone verification requested for ${requestedPhoneNumber}`);
      },
    }),
  ],
});
