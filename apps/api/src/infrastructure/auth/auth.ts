import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, phoneNumber } from "better-auth/plugins";

import { env } from "../config/runtime-env";
import { prisma } from "../database/prisma";

const algerianPhonePattern = /^(05|06|07)\d{8}$/;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
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
