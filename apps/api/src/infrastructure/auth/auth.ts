import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, phoneNumber } from "better-auth/plugins";

import { env } from "../config/runtime-env";
import { prisma } from "../database/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
    usePlural: false,
  }),
  emailAndPassword: {
    enabled: true,
  },
  baseURL: env.betterAuthUrl,
  secret: env.betterAuthSecret,
  trustedOrigins: env.allowedOrigins,
  plugins: [
    bearer(),
    phoneNumber({
      sendOTP: ({ code, phoneNumber }) => {
        console.info(`[better-auth] Phone verification requested for ${phoneNumber}: ${code}`);
      },
    }),
  ],
});
