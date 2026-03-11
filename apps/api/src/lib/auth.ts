import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer } from "better-auth/plugins/bearer";

import { prisma } from "./db";
import { env } from "./env";

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
  plugins: [bearer()],
});
