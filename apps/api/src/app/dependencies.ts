import { env } from "../infrastructure/config/runtime-env";
import type { BetterAuthInstance } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import type { AppDrizzle } from "../infrastructure/database/drizzle";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import type { BetterSqliteDatabase } from "../types/sqlite";
import { createAppConfig } from "../config";
import { createCompanyRepository } from "../config/database";
import { DrizzleAccountRepository } from "../modules/account/account.repository";
import { AccountService } from "../modules/account/account.service";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { CompanyService } from "../modules/company/company.service";
import { WorkforceService } from "../modules/company/workforce.service";
import { OperationsService } from "../modules/company/operations.service";
import { FinanceService } from "../modules/company/finance.service";
import { AuditService } from "../modules/company/audit.service";
import { WorkspaceMutationContext } from "../modules/company/workspace-mutation-context";
import { createInventoryRepository } from "../modules/inventory/inventory.repository";
import { InventoryService } from "../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../modules/inventory/inventory.storage";
import { InvoiceModule } from "../modules/invoice/invoice.module";
import { InvoiceRepository } from "../modules/invoice/adapters/invoice.repository";
import { createPaymentModule } from "../modules/payment/payment.module";
import { PaymentRepositoryImpl } from "../modules/payment/adapters/payment.repository";
import { SqlitePermissionResolver } from "../modules/rbac/permission-resolver";
import { RoleModule } from "../modules/rbac/role.module";
import { SqliteRoleRepository as SqliteRbacRoleRepository } from "../modules/rbac/sqlite-role.repository";
import { SessionService } from "../modules/session/session.service";
import { EmployeeModule } from "../modules/workforce/employee.module";
import { SqliteEmployeeRepository } from "../modules/workforce/adapters/employee.repository";
import { SqliteRoleRepository } from "../modules/workforce/adapters/role.repository";
import { createSqliteInvoiceDebtPort } from "../modules/invoice/adapters/invoice-debt.port";
import { RecoveryKeyService } from "../modules/auth/recovery-key.service";
import { UpdateService } from "../modules/update/update.service";
import { UpdateHistoryService } from "../modules/update/update-history.service";

/**
 * Create all application dependencies.
 *
 * @param sqlite - Shared SQLite handle (caller is responsible for lifecycle).
 *                 If omitted, a new connection is created (backwards compat).
 * @param drizzleDb - Pre-built Drizzle instance. If omitted, created from sqlite.
 */
/** Wire all application dependencies from a shared SQLite connection. */
export async function createAppDependencies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sqlite?: any,
  drizzleDb?: AppDrizzle,
  authInstance?: BetterAuthInstance,
) {
  const sharedDatabase = sqlite ?? createDatabaseConnection();
  const db = drizzleDb ?? createDrizzleFromSqlite(sharedDatabase);
  const auth = authInstance ?? (await import("../infrastructure/auth/auth")).createAuth(db);

  // Config-aware repository selection: honors DB_ADAPTER (sqlite | inmemory).
  // Note: when dbAdapter=inmemory only the company domain is in-memory; the
  // inventory/invoice/payment modules still use the SQLite handle until those
  // adapters are introduced in a follow-up phase.
  const config = createAppConfig();
  const companyRepository = createCompanyRepository(sharedDatabase, config);
  const inventoryRepository = createInventoryRepository(sharedDatabase);
  const accountRepository = new DrizzleAccountRepository(db);

  // Construct each domain service off the same `WorkspaceMutationContext`
  // so the per-domain service owns its transaction + audit context and
  // the `CompanyService` only has to forward delegations.
  const mutation = new WorkspaceMutationContext(companyRepository, companyRepository);
  const workforceService = new WorkforceService(companyRepository, companyRepository, mutation);
  const operationsService = new OperationsService(companyRepository, companyRepository, mutation);
  const financeService = new FinanceService(companyRepository, companyRepository, mutation);
  const auditService = new AuditService(companyRepository);
  const companyService = new CompanyService(companyRepository, companyRepository, {
    workforce: workforceService,
    operations: operationsService,
    finance: financeService,
    audit: auditService,
  });

  const employeeRepository = new SqliteEmployeeRepository(companyRepository);
  const roleRepository = new SqliteRoleRepository(companyRepository);
  const employeeModule = new EmployeeModule({ employeeRepository, roleRepository });
  const invoiceRepository = new InvoiceRepository(sharedDatabase, db);
  const invoiceDebtPort = createSqliteInvoiceDebtPort({
    db: sharedDatabase,
    repository: companyRepository,
  });
  const invoiceModule = new InvoiceModule(invoiceRepository, invoiceDebtPort);
  const paymentRepository = new PaymentRepositoryImpl(sharedDatabase);
  const paymentModule = createPaymentModule(paymentRepository, invoiceRepository, invoiceDebtPort);
  const authBootstrapService = new AuthBootstrapService(db, sharedDatabase, auth, env.bootstrapSetupKey);
  const permissionResolver = new SqlitePermissionResolver(sharedDatabase, authBootstrapService);
  const recoveryKeyService = new RecoveryKeyService(db, sharedDatabase);

  // Issue #10 — Slice 3 RBAC. The role module is a small, deep module
  // that wraps a Drizzle-backed RoleRepository. The repository is kept
  // separate from the workforce role repository (which only knows about
  // the role lookups employee creation needs) because the role module
  // needs to return roles with their full permission set, not just an
  // id/lookup. The two share the same underlying tables; they just
  // expose different shapes.
  const rbacRoleRepository = new SqliteRbacRoleRepository(db);
  const roleModule = new RoleModule({ repository: rbacRoleRepository });

  return {
    auth,
    accountService: new AccountService(accountRepository, auth),
    authBootstrapService,
    companyService,
    workforceService,
    operationsService,
    financeService,
    inventoryService: new InventoryService(
      inventoryRepository,
      new InventoryAttachmentStorage(env.attachmentsRootPath),
      companyService,
      companyRepository,
    ),
    sessionService: new SessionService(auth, permissionResolver),
    recoveryKeyService,
    updateService: new UpdateService(),
    updateHistoryService: new UpdateHistoryService(sharedDatabase),
    rawDatabase: sharedDatabase,
    employeeModule,
    invoiceModule,
    paymentModule,
    roleModule,
  } as const;
}

/** All resolved application dependencies, created once at startup. */
export type AppDependencies = Awaited<ReturnType<typeof createAppDependencies>>;
