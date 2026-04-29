import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { env } from "../infrastructure/config/runtime-env";
import { auth } from "../infrastructure/auth/auth";
import { resolveDatabaseEnv } from "../infrastructure/config/database-env";
import { prisma } from "../infrastructure/database/prisma";
import { PrismaAccountRepository } from "../modules/account/account.repository";
import { AccountService } from "../modules/account/account.service";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { createCompanyRepository } from "../modules/company/company.repository";
import { CompanyService } from "../modules/company/company.service";
import { createInventoryRepository } from "../modules/inventory/inventory.repository";
import { InventoryService } from "../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../modules/inventory/inventory.storage";
import { SessionService } from "../modules/session/session.service";

const { databasePath } = resolveDatabaseEnv();
mkdirSync(dirname(databasePath), { recursive: true });
const sharedDatabase = new Database(databasePath);

const companyRepository = createCompanyRepository(sharedDatabase);
const inventoryRepository = createInventoryRepository(sharedDatabase);
const accountRepository = new PrismaAccountRepository(prisma);
const companyService = new CompanyService(companyRepository);

export const appDependencies = {
  auth,
  accountService: new AccountService(accountRepository, auth),
  authBootstrapService: new AuthBootstrapService(prisma, auth, env.bootstrapSetupKey),
  companyService,
  inventoryService: new InventoryService(
    inventoryRepository,
    new InventoryAttachmentStorage(env.attachmentsRootPath),
    companyService,
  ),
  sessionService: new SessionService(auth),
} as const;

export type AppDependencies = typeof appDependencies;
