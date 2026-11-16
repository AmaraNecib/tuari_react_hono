import { randomUUID } from "node:crypto";
import { createAuth } from "../infrastructure/auth/auth";
import type { BetterAuthInstance } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { createConfigFileKeyPersister, type DatabaseKeyPersister } from "../infrastructure/database/database-key-persister";
import { createDatabaseKeyManager, type DatabaseKeyManager } from "../infrastructure/database/database-key-manager";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { ensureDatabaseSchema } from "../infrastructure/database/schema";
import { ensureExactNormalWorkspaceSchema, getExactWorkspaceId } from "../infrastructure/database/exact-normal-workspace-schema";
import { BetterSqlite3Executor } from "../infrastructure/database/sqlite-executor";
import { createAppConfig, type AppConfig } from "../config";
import { createCompanyRepository } from "../config/database";
import { DrizzleAccountRepository } from "../modules/account/account.repository";
import { AccountService } from "../modules/account/account.service";
import { SqliteBootstrapPort } from "../modules/auth/adapters/sqlite-bootstrap.port";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { CompanyService } from "../modules/company/company.service";
import { WorkforceService } from "../modules/company/workforce.service";
import { ExactEmployeeService } from "../modules/company/employee-exact.service";
import { ExactWorkforceService } from "../modules/company/workforce-exact.service";
import { SqliteExactEmployeeRepository } from "../modules/company/adapters/sqlite-exact-employee.repository";
import { SqliteExactWorkforceRepository } from "../modules/company/adapters/sqlite-exact-workforce.repository";
import { ExactFinanceService } from "../modules/company/exact-finance.service";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { OperationsService } from "../modules/company/operations.service";
import { FinanceService } from "../modules/company/finance.service";
import { AuditService } from "../modules/company/audit.service";
import { WorkspaceMutationContext } from "../modules/company/workspace-mutation-context";
import { createInventoryRepository } from "../modules/inventory/adapters/sqlite-inventory.repository";
import { createAssetChargeRepository } from "../modules/inventory/adapters/sqlite-asset-charge.repository";
import { AssetChargeService } from "../modules/inventory/asset-charge.service";
import { InventoryService } from "../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../modules/inventory/inventory.storage";
import { InvoiceModule } from "../modules/invoice/invoice.module";
import { InvoiceRepository } from "../modules/invoice/adapters/invoice.repository";
import { createPaymentModule } from "../modules/payment/payment.module";
import type { PaymentModule } from "../modules/payment/payment-module.interface";
import { PaymentRepositoryImpl } from "../modules/payment/adapters/payment.repository";
import { createExpensesModule } from "../modules/expenses/expenses.module";
import type { ExpensesModule } from "../modules/expenses/expenses-module.interface";
import { SqliteExpenseRepository } from "../modules/expenses/adapters/sqlite-expenses.repository";
import { createProjectCostRepository } from "../modules/project-cost/adapters/sqlite-project-cost.repository";
import { ProjectCostService } from "../modules/project-cost/project-cost.service";
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
import { createBackupService } from "../modules/backup/backup.service";
import { createWorkerSnapshotter } from "../modules/backup/backup.snapshot";
import type { BackupService } from "../modules/backup/backup.types";
import {
  createConfigFileBackupFolderPersister,
  type BackupFolderPersister,
} from "../infrastructure/config/backup-folder-persister";

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
   * SQLCipher encryption key. Defaults to the resolved application config's
   * `databaseKey` — itself env `APP_DB_KEY` first, then the config file's
   * `db_key` (see `createAppConfig`). Explicit injection always wins, so the
   * desktop host can still pin the key via its own secret store (#265/#352).
   */
  databaseKey?: string;
  /**
   * Pre-built Better Auth instance. Kept for test injection — tests pass a
   * mock or pre-configured auth without constructing a real database
   * connection.
   */
  authInstance?: BetterAuthInstance;
  /**
   * Root that holds the daily backup folders (#430). Defaults to
   * `appConfig.backupsRootPath`.
   */
  backupsRootPath?: string;
  /** Injected clock for the backup service (tests pin "due" without waiting). */
  now?: () => Date;
  /** Isolated legacy composition for legacy migration tests only. Normal startup uses slice 543. */
  legacyNumericTestMode?: true;
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
type SharedAppDependencies = {
  auth: BetterAuthInstance;
  mode: "legacy" | "slice543";
  accountService: AccountService;
  authBootstrapService: AuthBootstrapService;
  sessionService: SessionService;
  updateService: UpdateService;
  backupService: BackupService;
  backupFolderPersister: BackupFolderPersister;
  close: () => void;
};

export type LegacyAppDependencies = SharedAppDependencies & {
  mode: "legacy";
  accountService: AccountService;
  companyService: CompanyService;
  workforceService: WorkforceService;
  operationsService: OperationsService;
  financeService: FinanceService;
  inventoryService: InventoryService;
  employeeModule: EmployeeModule;
  invoiceModule: InvoiceModule;
  paymentModule: PaymentModule;
  expensesModule: ExpensesModule;
  projectCostService: ProjectCostService;
  roleModule: RoleModule;
  recoveryKeyService: RecoveryKeyService;
  updateHistoryService: UpdateHistoryService;
  databaseKeyManager: DatabaseKeyManager;
  databaseKeyPersister: DatabaseKeyPersister;
};

export type Slice543AppDependencies = SharedAppDependencies & {
  mode: "slice543";
  accountService: AccountService;
  workforceService: WorkforceService;
  operationsService: OperationsService;
  exactEmployeeService: ExactEmployeeService;
  exactWorkforceService: ExactWorkforceService;
  roleModule: RoleModule;
  databaseKeyManager: DatabaseKeyManager;
  databaseKeyPersister: DatabaseKeyPersister;
  exactFinanceService: ExactFinanceService;
  recoveryKeyService: RecoveryKeyService;
  workspaceId: string;
};

export type AppDependencies = LegacyAppDependencies | Slice543AppDependencies;

/**
 * Build the normal slice-543 dependency graph on the configured database.
 *
 * The default path creates or validates a fresh exact workspace before
 * building auth, the employee module and approved-earnings services. It
 * refuses to convert an existing database. Legacy schema migrations remain
 * available only through the explicit isolated-test mode.
 *
 * @param config - Optional database path/key and auth instance. The legacy
 *                 numeric composition is reserved for isolated tests.
 * @param appConfig - Validated application config. Defaults to `createAppConfig()`.
 */
export function createAppDependencies(
  config: CreateAppDependenciesConfig & { legacyNumericTestMode: true },
  appConfig?: AppConfig,
): Promise<LegacyAppDependencies>;
export function createAppDependencies(
  config?: CreateAppDependenciesConfig,
  appConfig?: AppConfig,
): Promise<AppDependencies>;
export async function createAppDependencies(
  config: CreateAppDependenciesConfig = {},
  appConfig: AppConfig = createAppConfig(),
): Promise<AppDependencies> {
  if (config.legacyNumericTestMode) return createLegacyNumericTestDependencies(config, appConfig);
  return createSlice543Dependencies(config, appConfig);
}

async function createLegacyNumericTestDependencies(
  config: CreateAppDependenciesConfig,
  appConfig: AppConfig,
): Promise<LegacyAppDependencies> {
  const databasePath = config.databasePath?.trim() ? config.databasePath : appConfig.databasePath;
  // Resolve the SQLCipher key: the explicit injection seam wins (desktop host
  // pinning, tests); otherwise the resolved application config key (env
  // APP_DB_KEY first, then the config file's `db_key`). Before #265 this fell
  // back only to process.env inside the factory, silently losing a
  // config-file `db_key` — a config-keyed encrypted deployment could not open
  // its database on restart. The key is null when no key is configured, which
  // the factory treats as an unencrypted (plain) database.
  const resolvedDatabaseKey = config.databaseKey ?? appConfig.databaseKey;
  const sharedDatabase = createDatabaseConnection(
    databasePath,
    resolvedDatabaseKey,
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
    // The 30s bound (issue #322 secondary) keeps a never-settling
    // transaction from leaving every queued writer hanging forever — each
    // waiting caller fails loudly after the bound instead of stalling.
    const connectionLock = createFifoLock({ timeoutMs: 30_000 });

    // Config-aware repository selection: honors DB_ADAPTER (sqlite | inmemory).
    // Note: when dbAdapter=inmemory only the company domain is in-memory; the
    // inventory/invoice/payment modules still use the SQLite handle until those
    // adapters are introduced in a follow-up phase.
    const companyRepository = createCompanyRepository(sharedDatabase, appConfig, connectionLock);
    const inventoryRepository = createInventoryRepository(sharedDatabase, connectionLock);
    // #413: project charges for asset placements. Shares the same connection
    // lock so a charge write inside the transfer transaction joins it.
    const assetChargeService = new AssetChargeService(
      createAssetChargeRepository(sharedDatabase, connectionLock, db),
      inventoryRepository,
    );
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
      lock: connectionLock,
    });
    const invoiceModule = new InvoiceModule(invoiceRepository, invoiceDebtPort);
    const paymentRepository = new PaymentRepositoryImpl(sharedDatabase, connectionLock);
    const paymentModule = createPaymentModule(paymentRepository, invoiceRepository, invoiceDebtPort);
    const expensesModule = createExpensesModule(
      new SqliteExpenseRepository(sharedDatabase, connectionLock),
    );
    // #414: the project page's cost total. Read-only aggregation over the
    // tables the expenses, workforce and inventory modules already write.
    const projectCostService = new ProjectCostService(
      createProjectCostRepository(sharedDatabase),
    );
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
      mode: "legacy",
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
        assetChargeService,
      ),
      sessionService: new SessionService(auth, permissionResolver),
      recoveryKeyService,
      updateService: new UpdateService(),
      updateHistoryService: new UpdateHistoryService(new SqliteUpdateHistoryPort(sharedDatabase, connectionLock)),
      backupService: createBackupService({
        snapshot: createWorkerSnapshotter({
          databasePath,
          databaseKey: resolvedDatabaseKey,
        }),
        backupsRootPath: config.backupsRootPath ?? appConfig.backupsRootPath,
        now: config.now,
      }),
      // The desktop shell points the sidecar at `<tuari>/config.json`, so the
      // chosen backup root persists where the next sidecar run reads it. A
      // deployment with no config file gets a session-only choice (#436).
      backupFolderPersister: createConfigFileBackupFolderPersister(
        process.env.TUARI_CONFIG_FILE?.trim() || null,
      ),
      databaseKeyManager: createDatabaseKeyManager(sharedDatabase),
      // Persist a rotated key into the user-editable config file so a restart
      // can still open the database (issue #265). The desktop host pins the
      // key via its own secret store — mergeConfigIntoEnv only ever reads a
      // config `db_key` when env APP_DB_KEY is UNSET, so when APP_DB_KEY is
      // set (the desktop deployment) a config copy would be both unread AND
      // a plaintext duplicate of a keyring secret. The persister is a no-op
      // (null path) in that case and covers file-driven deployments only.
      databaseKeyPersister: createConfigFileKeyPersister(
        process.env.APP_DB_KEY ? null : process.env.TUARI_CONFIG_FILE?.trim() || null,
      ),
      employeeModule,
      invoiceModule,
      paymentModule,
      expensesModule,
      projectCostService,
      roleModule,
      close,
    } as const;
  } catch (error) {
    close();
    throw error;
  }
}

async function createSlice543Dependencies(
  config: CreateAppDependenciesConfig,
  appConfig: AppConfig,
): Promise<Slice543AppDependencies> {
  if (appConfig.dbAdapter !== "sqlite") throw new Error("Slice 543 requires the configured SQLite workspace");
  const databasePath = config.databasePath?.trim() ? config.databasePath : appConfig.databasePath;
  const resolvedDatabaseKey = config.databaseKey ?? appConfig.databaseKey;
  const sharedDatabase = createDatabaseConnection(databasePath, resolvedDatabaseKey);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    sharedDatabase.close();
  };

  try {
    ensureExactNormalWorkspaceSchema(sharedDatabase);
    const workspaceId = getExactWorkspaceId(sharedDatabase);
    const db = createDrizzleFromSqlite(sharedDatabase);
    const auth = config.authInstance ?? createAuth(db, appConfig);
    const connectionLock = createFifoLock({ timeoutMs: 30_000 });
    const recoveryKeyService = new RecoveryKeyService(new SqliteRecoveryKeyPort(db, sharedDatabase, connectionLock));
    const dependencies = { id: randomUUID, now: () => new Date().toISOString() };
    const companyRepository = createCompanyRepository(sharedDatabase, appConfig, connectionLock);
    const mutation = new WorkspaceMutationContext(companyRepository, companyRepository);
    const workforceService = new WorkforceService(companyRepository, companyRepository, mutation);
    const exactEmployeeRepository = new SqliteExactEmployeeRepository(sharedDatabase, connectionLock, dependencies);
    const operationsService = new OperationsService(companyRepository, exactEmployeeRepository, mutation);
    const financeService = new ExactFinanceService(
      new SqliteExactFinanceRepository(sharedDatabase, connectionLock), dependencies,
    );
    const exactWorkforceService = new ExactWorkforceService(
      new SqliteExactWorkforceRepository(sharedDatabase, connectionLock), financeService, dependencies,
    );
    const exactEmployeeService = new ExactEmployeeService(exactEmployeeRepository, dependencies);
    const authBootstrapService = new AuthBootstrapService(
      new SqliteBootstrapPort(db, sharedDatabase, connectionLock), auth, appConfig.bootstrapSetupKey,
    );
    const permissionResolver = new SqlitePermissionResolver(db, authBootstrapService);
    const roleModule = new RoleModule({ repository: new SqliteRbacRoleRepository(db) });
    const backupService = createBackupService({
      snapshot: createWorkerSnapshotter({ databasePath, databaseKey: resolvedDatabaseKey }),
      backupsRootPath: config.backupsRootPath ?? appConfig.backupsRootPath,
      now: config.now,
    });

    return {
      mode: "slice543",
      auth,
      accountService: new AccountService(new DrizzleAccountRepository(db, connectionLock), auth),
      authBootstrapService,
      sessionService: new SessionService(auth, permissionResolver),
      updateService: new UpdateService(),
      backupService,
      backupFolderPersister: createConfigFileBackupFolderPersister(process.env.TUARI_CONFIG_FILE?.trim() || null),
      workforceService,
      operationsService,
      exactEmployeeService,
      exactWorkforceService,
      roleModule,
      exactFinanceService: financeService,
      recoveryKeyService,
      workspaceId,
      databaseKeyManager: createDatabaseKeyManager(sharedDatabase),
      databaseKeyPersister: createConfigFileKeyPersister(
        process.env.APP_DB_KEY ? null : process.env.TUARI_CONFIG_FILE?.trim() || null,
      ),
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
