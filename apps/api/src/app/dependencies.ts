import { env } from "../infrastructure/config/runtime-env";
import { auth } from "../infrastructure/auth/auth";
import { prisma } from "../infrastructure/database/prisma";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { createCompanyRepository } from "../modules/company/company.repository";
import { CompanyService } from "../modules/company/company.service";
import { SessionService } from "../modules/session/session.service";

const companyRepository = createCompanyRepository();

export const appDependencies = {
  auth,
  authBootstrapService: new AuthBootstrapService(prisma, auth, env.bootstrapSetupKey),
  companyService: new CompanyService(companyRepository),
  sessionService: new SessionService(auth),
} as const;

export type AppDependencies = typeof appDependencies;
