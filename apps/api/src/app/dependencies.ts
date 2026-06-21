import { env } from "../infrastructure/config/runtime-env";
import { auth } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { prisma } from "../infrastructure/database/prisma";
import { PrismaAccountRepository } from "../modules/account/account.repository";
import { AccountService } from "../modules/account/account.service";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { createCompanyRepository } from "../modules/company/company.repository";
import { CompanyService } from "../modules/company/company.service";
import { WorkforceService } from "../modules/company/workforce.service";
import { OperationsService } from "../modules/company/operations.service";
import { FinanceService } from "../modules/company/finance.service";
import { createInventoryRepository } from "../modules/inventory/inventory.repository";
import { InventoryService } from "../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../modules/inventory/inventory.storage";
import { SqlitePermissionResolver } from "../modules/rbac/sqlite-permission-resolver";
import { SessionService } from "../modules/session/session.service";
import { EmployeeModule } from "../modules/workforce/employee.module";
import { SqliteEmployeeRepository } from "../modules/workforce/adapters/sqlite-employee.repository";
import { SqliteRoleRepository } from "../modules/workforce/adapters/sqlite-role.repository";

export async function createAppDependencies() {
  const sharedDatabase = await createDatabaseConnection();

  const companyRepository = createCompanyRepository(sharedDatabase);
  const inventoryRepository = createInventoryRepository(sharedDatabase);
  const accountRepository = new PrismaAccountRepository(prisma);
  const companyService = new CompanyService(companyRepository, companyRepository);

  const employeeRepository = new SqliteEmployeeRepository(companyRepository);
  const roleRepository = new SqliteRoleRepository(companyRepository);
  const employeeModule = new EmployeeModule({ employeeRepository, roleRepository });
  const permissionResolver = new SqlitePermissionResolver(sharedDatabase);

  return {
    auth,
    accountService: new AccountService(accountRepository, auth),
    authBootstrapService: new AuthBootstrapService(prisma, auth, env.bootstrapSetupKey),
    companyService,
    workforceService: new WorkforceService(companyService),
    operationsService: new OperationsService(companyService),
    financeService: new FinanceService(companyService),
    inventoryService: new InventoryService(
      inventoryRepository,
      new InventoryAttachmentStorage(env.attachmentsRootPath),
      companyService,
      companyRepository,
    ),
    sessionService: new SessionService(auth, permissionResolver),
    employeeModule,
  } as const;
}

export type AppDependencies = Awaited<ReturnType<typeof createAppDependencies>>;
