import { createAuth } from "../infrastructure/auth/auth";
import type { BetterAuthInstance } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { createDatabaseKeyManager, type DatabaseKeyManager } from "../infrastructure/database/database-key-manager";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { ensureDatabaseSchema } from "../infrastructure/database/schema";
import { BetterSqlite3Executor } from "../infrastructure/database/sqlite-executor";
import { createAppConfig, type AppConfig } from "../config";
import { createCompanyRepository } from "../config/database";
import { DrizzleAccountRepository } from "../modules/account/account.repository";
import { AccountService } from "../modules/account/account.service";
import { SqliteBootstrapPort } from "../modules/auth/adapters/sqlite-bootstrap.port";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { CompanyService } from "../modules/company/company.service";
import { WorkforceService } from "../modules/company/workforce.service";
import { OperationsService } from "../modules/company/operations.service";
import { FinanceService } from "../modules/company/finance.service";
import { AuditService } from "../modules/company/audit.service";
import { WorkspaceMutationContext } from "../modules/company/workspace-mutation-context";
import { createInventoryRepository } from "../modules/inventory/adapters/sqlite-inventory.repository";
import { InventoryService } from "../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../modules/inventory/inventory.storage";
import { InvoiceModule } from "../modules/invoice/invoice.module";
import { InvoiceRepository } from "../modules/invoice/adapters/invoice.repository";
import { createPaymentModule } from "../modules/payment/payment.module";
import type { PaymentModule } from "../modules/payment/payment-module.interface";
import { PaymentRepositoryImpl } from "../modules/payment/adapters/payment.repository";
import { SqlitePermissionResolver } from "../modules/rbac/adapters/sqlite-permission-resolver";
import { RoleModule } from "../modules/rbac/role.module";
import { SqliteRoleRepository as SqliteRbacRoleRepository } from "../modules/rbac/adapters/sqlite-role.repository";
import { SessionService } from "../modules/session/session.service";
import { EmployeeModule } from "../modules/workforce/employee.module";
import { SqliteEmployeeRepository } from "../modules/workforce/adapters/employee.repository";
import { SqliteRoleRepository } from "../modules/workforce/adapters/role.repository";
import { createSqliteInvoiceDebtPort } from "../modules/invoice/adapters/invoice-debt.port";
import { RecoveryKeyService } from "../modules/auth/recovery-key.service";
import { SqliteRecoveryKeyPort } from "../modules/auth/adapters/sqlite-recovery-key.port";
import { UpdateService } from "../modules/update/update.service";
import { UpdateHistoryService } from "../modules/update/update-history.service";
import { SqliteUpdateHistoryPort } from "../modules/update/adapters/sqlite-update-history.port";

/**
 * Optional configuration for {@link createAppDependencies}.
 *
 * Every field is a seam for tests (or the desktop host) to inject without
 * constructing raw database handles themselves. When omitted, values resolve
 * from the validated `AppConfig` (itself env + optional config file).
 */
export type CreateAppDependenciesConfig = {
  /** SQLite file path (or `:memory:`). Defaults to `appConfig.databasePath`. */
  databasePath?: string;
  /**
   * SQLCipher encryption key. Defaults to `process.env.APP_DB_KEY`. The
   * validated `AppConfig` carries no key field, so env is the only fallback.
   */
  databaseKey?: string;
  /**
   * Pre-built Better Auth instance. Kept for test injection — tests pass a
   * mock or pre-configured auth without constructing a real database
   * connection.
   */
  authInstance?: BetterAuthInstance;
};

/**
 * All resolved application dependencies, created once at startup.
 *
 * Explicitly declared (rather than `ReturnType<typeof createAppDependencies>`)
 * so the tsup dts build can name every field — the raw database handle is
 * deliberately NOT exposed here; the composition root keeps it, and the
 * router/system handlers receive the narrow {@link DatabaseKeyManager} port
 * instead.
 */
export type AppDependencies = {
  auth: BetterAuthInstance;
  accountService: AccountService;
  authBootstrapService: AuthBootstrapService;
  companyService: CompanyService;
  workforceService: WorkforceService;
  operationsService: OperationsService;
  financeService: FinanceService;
  inventoryService: InventoryService;
  sessionService: SessionService;
  recoveryKeyService: RecoveryKeyService;
  updateService: UpdateService;
  updateHistoryService: UpdateHistoryService;
  databaseKeyManager: DatabaseKeyManager;
  employeeModule: EmployeeModule;
  invoiceModule: InvoiceModule;
  paymentModule: PaymentModule;
  roleModule: RoleModule;
  /** Close the shared database connection (idempotent; composition-root lifecycle). */
  close: () => void;
};

/**
 * Create all application dependencies — fully self-contained.
 *
 * The function opens the database connection, runs the schema migrations,
 * builds Drizzle + better-auth, and wires every domain service. No raw
 * database handle is accepted as input or exposed on the result; callers
 * (e.g. `index.ts`) call it with no arguments (or config only).
 *
 * @param config - Optional injection seams (database path/key, auth instance).
 * @param appConfig - Validated application config. Defaults to `createAppConfig()`
 *                    (env + optional config file). Injectable so tests can pass a
 *                    controlled config (e.g. DB_ADAPTER=inmemory).
 */
export async function createAppDependencies(
  config: CreateAppDependenciesConfig = {},
  appConfig: AppConfig = createAppConfig(),
): Promise<AppDependencies> {
  const sharedDatabase = createDatabaseConnection(
    config.databasePath?.trim() ? config.databasePath : appConfig.databasePath,
    config.databaseKey,
  );
  // Idempotent close: the root opens the connection, so the root closes it.
  // `close` is also invoked on construction failure so a partially-built root
  // never leaks the handle (Windows EBUSY on temp-file test cleanup).
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    sharedDatabase.close();
  };

  try {
    // Schema migrations run on the connection the root just opened — the
    // caller no longer has (or needs) a handle to migrate beforehand.
    await ensureDatabaseSchema(new BetterSqlite3Executor(sharedDatabase));

    const db = createDrizzleFromSqlite(sharedDatabase);
    const auth = config.authInstance ?? createAuth(db, appConfig);

    // Connection-wide transaction lock: the API runs every module on ONE
    // better-sqlite3 connection, and better-sqlite3 throws if a raw BEGIN is
    // issued while another transaction is open. Every module that opens a
    // transaction on the shared connection receives THIS lock (issue #288).
    const connectionLock = createFifoLock();

    // Config-aware repository selection: honors DB_ADAPTER (sqlite | inmemory).
    // Note: when dbAdapter=inmemory only the company domain is in-memory; the
    // inventory/invoice/payment modules still use the SQLite handle until those
    // adapters are introduced in a follow-up phase.
    const companyRepository = createCompanyRepository(sharedDatabase, appConfig);
    const inventoryRepository = createInventoryRepository(sharedDatabase);
    const accountRepository = new DrizzleAccountRepository(db, connectionLock);

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
    const invoiceRepository = new InvoiceRepository(sharedDatabase, connectionLock, db);
    const invoiceDebtPort = createSqliteInvoiceDebtPort({
      db: sharedDatabase,
      repository: companyRepository,
    });
    const invoiceModule = new InvoiceModule(invoiceRepository, invoiceDebtPort);
    const paymentRepository = new PaymentRepositoryImpl(sharedDatabase, connectionLock);
    const paymentModule = createPaymentModule(paymentRepository, invoiceRepository, invoiceDebtPort);
    const authBootstrapService = new AuthBootstrapService(
      new SqliteBootstrapPort(db, sharedDatabase, connectionLock),
      auth,
      appConfig.bootstrapSetupKey,
    );
    const permissionResolver = new SqlitePermissionResolver(db, authBootstrapService);
    const recoveryKeyService = new RecoveryKeyService(
      new SqliteRecoveryKeyPort(db, sharedDatabase, connectionLock),
    );

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
        new InventoryAttachmentStorage(appConfig.attachmentsRootPath),
        companyService,
        companyRepository,
      ),
      sessionService: new SessionService(auth, permissionResolver),
      recoveryKeyService,
      updateService: new UpdateService(),
      updateHistoryService: new UpdateHistoryService(new SqliteUpdateHistoryPort(sharedDatabase)),
      databaseKeyManager: createDatabaseKeyManager(sharedDatabase),
      employeeModule,
      invoiceModule,
      paymentModule,
      roleModule,
      close,
    } as const;
  } catch (error) {
    close();
    throw error;
  }
}
