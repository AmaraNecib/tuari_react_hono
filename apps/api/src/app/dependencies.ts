import type Database from "better-sqlite3-sqlcipher";

import { env } from "../infrastructure/config/runtime-env";
import type { BetterAuthInstance } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import type { AppDrizzle } from "../infrastructure/database/drizzle";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { DrizzleAccountRepository } from "../modules/account/account.repository";
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
import { InvoiceModule } from "../modules/invoice/invoice.module";
import { SqliteInvoiceRepository } from "../modules/invoice/adapters/sqlite-invoice.repository";
import { createPaymentModule } from "../modules/payment/payment.module";
import { SqlitePaymentRepository } from "../modules/payment/adapters/sqlite-payment.repository";
import { SqlitePermissionResolver } from "../modules/rbac/sqlite-permission-resolver";
import { SessionService } from "../modules/session/session.service";
import { EmployeeModule } from "../modules/workforce/employee.module";
import { SqliteEmployeeRepository } from "../modules/workforce/adapters/sqlite-employee.repository";
import { SqliteRoleRepository } from "../modules/workforce/adapters/sqlite-role.repository";
import { createSqliteInvoiceDebtPort } from "../modules/invoice/adapters/invoice-debt.port";

/**
 * Create all application dependencies.
 *
 * @param sqlite - Shared SQLite handle (caller is responsible for lifecycle).
 *                 If omitted, a new connection is created (backwards compat).
 * @param drizzleDb - Pre-built Drizzle instance. If omitted, created from sqlite.
 */
export async function createAppDependencies(
  sqlite?: Database.Database,
  drizzleDb?: AppDrizzle,
  authInstance?: BetterAuthInstance,
) {
  const sharedDatabase = sqlite ?? createDatabaseConnection();
  const db = drizzleDb ?? createDrizzleFromSqlite(sharedDatabase);
  const auth = authInstance ?? (await import("../infrastructure/auth/auth")).createAuth(db);

  const companyRepository = createCompanyRepository(sharedDatabase);
  const inventoryRepository = createInventoryRepository(sharedDatabase);
  const accountRepository = new DrizzleAccountRepository(db);
  const companyService = new CompanyService(companyRepository, companyRepository);

  const employeeRepository = new SqliteEmployeeRepository(companyRepository);
  const roleRepository = new SqliteRoleRepository(companyRepository);
  const employeeModule = new EmployeeModule({ employeeRepository, roleRepository });
  const invoiceRepository = new SqliteInvoiceRepository(sharedDatabase);
  const invoiceDebtPort = createSqliteInvoiceDebtPort({
    db: sharedDatabase,
    repository: companyRepository,
  });
  const invoiceModule = new InvoiceModule(invoiceRepository, invoiceDebtPort);
  const paymentRepository = new SqlitePaymentRepository(sharedDatabase);
  const paymentModule = createPaymentModule(paymentRepository, invoiceRepository, invoiceDebtPort);
  const authBootstrapService = new AuthBootstrapService(db, auth, env.bootstrapSetupKey);
  const permissionResolver = new SqlitePermissionResolver(sharedDatabase, authBootstrapService);

  return {
    auth,
    accountService: new AccountService(accountRepository, auth),
    authBootstrapService,
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
    invoiceModule,
    paymentModule,
  } as const;
}

/** All resolved application dependencies, created once at startup. */
export type AppDependencies = Awaited<ReturnType<typeof createAppDependencies>>;
