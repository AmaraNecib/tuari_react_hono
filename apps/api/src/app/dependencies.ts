import { env } from "../infrastructure/config/runtime-env";
import { auth } from "../infrastructure/auth/auth";
import { prisma } from "../infrastructure/database/prisma";
import { PrismaAccountRepository } from "../modules/account/account.repository";
import { AccountService } from "../modules/account/account.service";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { createCompanyRepository } from "../modules/company/company.repository";
import { CompanyService } from "../modules/company/company.service";
import { SessionService } from "../modules/session/session.service";

const companyRepository = createCompanyRepository();
const accountRepository = new PrismaAccountRepository(prisma);

export const appDependencies = {
  auth,
  accountService: new AccountService(accountRepository, auth),
  authBootstrapService: new AuthBootstrapService(prisma, auth, env.bootstrapSetupKey),
  companyService: new CompanyService(companyRepository),
  sessionService: new SessionService(auth),
} as const;

export type AppDependencies = typeof appDependencies;
