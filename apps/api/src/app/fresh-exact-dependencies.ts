import type { WorkspaceMetadata } from "@tuari/contracts";
import type { AppDependencies, CreateAppDependenciesConfig } from "./dependencies";
import { createExperimentalFinancialDependencies, createFinancialDependencies, type ExperimentalFinancialDependencies, type FinancialDependencies } from "./financial-dependencies";
import { createAppConfig, type AppConfig } from "../config";
import { createCompanyRepository } from "../config/database";
import { createAuth } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { ensureFreshManualSettlementApplicationSchema } from "../infrastructure/database/fresh-manual-settlement-schema";
import { ensureFreshExperimentalInvoiceSettlementSchema } from "../infrastructure/database/fresh-experimental-invoice-settlement-schema";
import type { ExperimentalInvoiceSettlementParticipant } from "../modules/invoice/experimental-invoice-settlement-participant";
import { ManualSettlementService } from "../modules/company/manual-settlement.service";
import { SqliteManualSettlementRepository } from "../modules/company/adapters/sqlite-manual-settlement.repository";
import { SqliteManualSettlementAuthorization } from "../modules/company/adapters/sqlite-manual-settlement.authorization";
import type { ManualSettlementCapability } from "../rpc/manual-settlement-router";
import { ensureFreshExactApplicationSchema } from "../infrastructure/database/fresh-exact-schema";
import { createDatabaseKeyManager } from "../infrastructure/database/database-key-manager";
import { createConfigFileKeyPersister } from "../infrastructure/database/database-key-persister";
import { createConfigFileBackupFolderPersister } from "../infrastructure/config/backup-folder-persister";
import { DrizzleAccountRepository } from "../modules/account/account.repository";
import { AccountService } from "../modules/account/account.service";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { SqliteBootstrapPort } from "../modules/auth/adapters/sqlite-bootstrap.port";
import { RecoveryKeyService } from "../modules/auth/recovery-key.service";
import { SqliteRecoveryKeyPort } from "../modules/auth/adapters/sqlite-recovery-key.port";
import { CompanyMetadataService } from "../modules/company/company-metadata.service";
import { CounterpartyService } from "../modules/company/counterparty.service";
import { WorkforceService } from "../modules/company/workforce.service";
import { OperationsService } from "../modules/company/operations.service";
import { AuditService } from "../modules/company/audit.service";
import { WorkspaceMutationContext } from "../modules/company/workspace-mutation-context";
import { CatalogService } from "../modules/inventory/catalog.service";
import { AttachmentService } from "../modules/attachments/attachment.service";
import { SqliteAttachmentRepository } from "../modules/attachments/sqlite-attachment.repository";
import { createInventoryRepository } from "../modules/inventory/adapters/sqlite-inventory.repository";
import { ExpenseAttachments } from "../modules/expenses/expense-attachments";
import { InventoryAttachmentStorage } from "../modules/inventory/inventory.storage";
import { ProjectCostService } from "../modules/project-cost/project-cost.service";
import { createExactProjectCostRepository } from "../modules/project-cost/adapters/sqlite-exact-project-cost.repository";
import { RoleModule } from "../modules/rbac/role.module";
import { SqliteRoleRepository as SqliteRbacRoleRepository } from "../modules/rbac/adapters/sqlite-role.repository";
import { SqlitePermissionResolver } from "../modules/rbac/adapters/sqlite-permission-resolver";
import { SessionService } from "../modules/session/session.service";
import { EmployeeModule } from "../modules/workforce/employee.module";
import { SqliteEmployeeRepository } from "../modules/workforce/adapters/employee.repository";
import { SqliteRoleRepository } from "../modules/workforce/adapters/role.repository";
import { SqliteEmployeeEarningRepository } from "../modules/workforce/adapters/sqlite-employee-earning.repository";
import { UpdateService } from "../modules/update/update.service";
import { UpdateHistoryService } from "../modules/update/update-history.service";
import { SqliteUpdateHistoryPort } from "../modules/update/adapters/sqlite-update-history.port";
import { createBackupService } from "../modules/backup/backup.service";
import { createWorkerSnapshotter } from "../modules/backup/backup.snapshot";
import { ExactDebtReportReader } from "../modules/reports/exact-debt-report";
import { SqliteExactDebtReportSnapshot } from "../modules/reports/exact-debt-report-snapshot";
import { ExactInventoryReports } from "../modules/reports/exact-inventory-reports";
import { SqliteExactInventoryRepository } from "../modules/inventory/adapters/sqlite-exact-inventory.repository";
import { ExactInventoryReportSource } from "../modules/reports/exact-inventory-report-source";
import { createExactReportCapability, type ExactReportCapability } from "../rpc/exact-reports-router";
import { createExactSystemLogReader, type ExactSystemLogReader } from "../modules/company/exact-system-log.reader";

export type FreshExactAppDependencies = Omit<AppDependencies,
  "companyService" | "financeService" | "inventoryService" | "invoiceModule" | "paymentModule" | "expensesModule"
> & {
  mode: "fresh-exact-selected";
  companyService: CompanyMetadataService;
  inventoryAttachmentService: AttachmentService;
  catalogService: CatalogService;
  financial: { services: FinancialDependencies; getMetadata(): Promise<WorkspaceMetadata>; reports: ExactReportCapability; manualSettlement?: ManualSettlementCapability };
  listSystemLog: ExactSystemLogReader["listSystemLog"];
  payroll: { service: FinancialDependencies["payroll"]; opening: FinancialDependencies["opening"]; getEmployeePayroll: FinancialDependencies["lifecycle"]["getEmployeePayroll"] };
};

type SelectedFinancialServices = FinancialDependencies | ExperimentalFinancialDependencies;
type SelectedAppDependencies<TMode extends string, TServices extends SelectedFinancialServices> = Omit<FreshExactAppDependencies, "mode" | "financial"> & {
  mode: TMode;
  financial: { services: TServices; getMetadata(): Promise<WorkspaceMetadata>; reports: ExactReportCapability; manualSettlement?: ManualSettlementCapability };
};
type SelectedComposition<TMode extends string, TServices extends SelectedFinancialServices> = {
  mode: TMode;
  ensureSchema(connection: ReturnType<typeof createDatabaseConnection>, config: CreateAppDependenciesConfig & { disposableManualSettlement?: boolean }): Promise<void>;
  createFinancial(connection: ReturnType<typeof createDatabaseConnection>, lock: ReturnType<typeof createFifoLock>, dependencies: { id(): string; now(): string }): TServices;
  invoiceParticipant(financial: TServices): ExperimentalInvoiceSettlementParticipant | undefined;
  manualSettlementEnabled(config: CreateAppDependenciesConfig & { disposableManualSettlement?: boolean }): boolean;
};

async function createSelectedAppDependencies<TMode extends string, TServices extends SelectedFinancialServices>(
  config: CreateAppDependenciesConfig & { disposableManualSettlement?: boolean },
  appConfig: AppConfig,
  composition: SelectedComposition<TMode, TServices>,
): Promise<SelectedAppDependencies<TMode, TServices>> {
  if (appConfig.dbAdapter !== "sqlite") throw new Error("Selected exact root requires sqlite metadata on the shared connection");
  const databasePath = config.databasePath?.trim() ? config.databasePath : appConfig.databasePath;
  const databaseKey = config.databaseKey ?? appConfig.databaseKey;
  const connection = createDatabaseConnection(databasePath, databaseKey, { journalMode: "preserve" });
  let closed = false;
  const close = () => { if (!closed) { closed = true; connection.close(); } };
  try {
    await composition.ensureSchema(connection, config);
    connection.pragma("journal_mode = WAL");
    const db = createDrizzleFromSqlite(connection);
    const lock = createFifoLock({ timeoutMs: 30_000 });
    const auth = config.authInstance ?? createAuth(db, appConfig);
    const dependencies = { id: () => crypto.randomUUID(), now: () => new Date().toISOString() };
    const financial = composition.createFinancial(connection, lock, dependencies);
    const invoiceParticipant = composition.invoiceParticipant(financial);
    const reports = createExactReportCapability(
      new ExactDebtReportReader(new SqliteExactDebtReportSnapshot(connection, lock, financial.financeRepository)),
      new ExactInventoryReports(new ExactInventoryReportSource(connection, lock)),
    );
    const systemLog = createExactSystemLogReader(connection, lock);
    const company = createCompanyRepository(connection, appConfig, lock);
    const mutation = new WorkspaceMutationContext(company, company);
    const workforceService = new WorkforceService(company, company, mutation, new SqliteEmployeeEarningRepository(connection, lock), {
      hasForEmployee: employeeId => financial.financeRepository.listAccounts().some(account => account.workerId === employeeId),
    });
    const operationsService = new OperationsService(company, company, mutation);
    const companyService = new CompanyMetadataService(workforceService, operationsService, new AuditService(company), new CounterpartyService(company, mutation));
    const roleModule = new RoleModule({ repository: new SqliteRbacRoleRepository(db) });
    const authBootstrapService = new AuthBootstrapService(new SqliteBootstrapPort(db, connection, lock), auth, appConfig.bootstrapSetupKey);
    const inventoryRepository = createInventoryRepository(connection, lock);
    const catalog = new CatalogService(inventoryRepository, company);
    const attachments = new AttachmentService(new SqliteAttachmentRepository(connection, lock), new InventoryAttachmentStorage(appConfig.attachmentsRootPath), company);
    const exactInventoryRepository = new SqliteExactInventoryRepository(connection, lock);
    const manualSettlement: ManualSettlementCapability | undefined = composition.manualSettlementEnabled(config)
      ? userId => new ManualSettlementService(
        financial.finance, financial.financeRepository,
        new SqliteManualSettlementRepository(connection, lock, exactInventoryRepository, invoiceParticipant),
        new SqliteManualSettlementAuthorization(connection, lock, userId), dependencies,
        exactInventoryRepository, invoiceParticipant,
      )
      : undefined;
    return {
      mode: composition.mode,
      financial: { manualSettlement, services: financial, getMetadata: async () => ({ ...companyService.getWorkspaceMetadata(), roles: await roleModule.list() }), reports },
      listSystemLog: systemLog.listSystemLog,
      payroll: { service: financial.payroll, opening: financial.opening, getEmployeePayroll: id => financial.lifecycle.getEmployeePayroll(id) },
      auth,
      accountService: new AccountService(new DrizzleAccountRepository(db, lock), auth),
      authBootstrapService,
      companyService,
      workforceService,
      operationsService,
      catalogService: catalog,
      inventoryAttachmentService: attachments,
      expenseAttachments: new ExpenseAttachments(connection, lock, new InventoryAttachmentStorage(appConfig.attachmentsRootPath)),
      sessionService: new SessionService(auth, new SqlitePermissionResolver(db, authBootstrapService)),
      recoveryKeyService: new RecoveryKeyService(new SqliteRecoveryKeyPort(db, connection, lock)),
      updateService: new UpdateService(),
      updateHistoryService: new UpdateHistoryService(new SqliteUpdateHistoryPort(connection, lock)),
      backupService: createBackupService({ snapshot: createWorkerSnapshotter({ databasePath, databaseKey, attachmentsRootPath: appConfig.attachmentsRootPath }), backupsRootPath: config.backupsRootPath ?? appConfig.backupsRootPath, now: config.now }),
      backupFolderPersister: createConfigFileBackupFolderPersister(process.env.TUARI_CONFIG_FILE?.trim() || null),
      databaseKeyManager: createDatabaseKeyManager(connection),
      databaseKeyPersister: createConfigFileKeyPersister(process.env.APP_DB_KEY ? null : process.env.TUARI_CONFIG_FILE?.trim() || null),
      employeeModule: new EmployeeModule({ employeeRepository: new SqliteEmployeeRepository(company), roleRepository: new SqliteRoleRepository(company) }),
      projectCostService: new ProjectCostService(createExactProjectCostRepository(connection, lock)),
      roleModule,
      close,
    };
  } catch (error) { close(); throw error; }
}

/** Exact root for supported normal databases. Its defaults are unchanged. */
export function createFreshExactAppDependencies(
  config: CreateAppDependenciesConfig & { disposableManualSettlement?: boolean } = {},
  appConfig: AppConfig = createAppConfig(),
): Promise<FreshExactAppDependencies> {
  return createSelectedAppDependencies(config, appConfig, {
    mode: "fresh-exact-selected",
    ensureSchema: (connection, options) => (options.disposableManualSettlement ? ensureFreshManualSettlementApplicationSchema : ensureFreshExactApplicationSchema)(connection),
    createFinancial: createFinancialDependencies,
    invoiceParticipant: () => undefined,
    manualSettlementEnabled: options => options.disposableManualSettlement === true,
  });
}

export type FreshExperimentalInvoiceSettlementAppDependencies = SelectedAppDependencies<"fresh-experimental-invoice-settlement", ExperimentalFinancialDependencies>;

/** Explicit, disposable-only application root. It never selects the cash-only invoice adapter. */
export function createExperimentalInvoiceSettlementAppDependencies(
  config: CreateAppDependenciesConfig = {},
  appConfig: AppConfig = createAppConfig(),
): Promise<FreshExperimentalInvoiceSettlementAppDependencies> {
  return createSelectedAppDependencies(config, appConfig, {
    mode: "fresh-experimental-invoice-settlement",
    ensureSchema: connection => ensureFreshExperimentalInvoiceSettlementSchema(connection),
    createFinancial: createExperimentalFinancialDependencies,
    invoiceParticipant: financial => financial.invoiceParticipant,
    manualSettlementEnabled: () => true,
  });
}
