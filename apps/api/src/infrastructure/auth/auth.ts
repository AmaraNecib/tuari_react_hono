import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer } from "better-auth/plugins/bearer";

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
  plugins: [bearer()],
});
