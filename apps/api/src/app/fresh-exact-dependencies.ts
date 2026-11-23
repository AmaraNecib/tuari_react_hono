import type { WorkspaceMetadata } from "@tuari/contracts";
import type { AppDependencies, CreateAppDependenciesConfig } from "./dependencies";
import { createFinancialDependencies, type FinancialDependencies } from "./financial-dependencies";
import { createAppConfig, type AppConfig } from "../config";
import { createCompanyRepository } from "../config/database";
import { createAuth } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
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
import { InventoryService } from "../modules/inventory/inventory.service";
import { createInventoryRepository } from "../modules/inventory/adapters/sqlite-inventory.repository";
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
import { ExactInventoryReportSource } from "../modules/reports/exact-inventory-report-source";
import { createExactReportCapability, type ExactReportCapability } from "../rpc/exact-reports-router";
import { createExactSystemLogReader, type ExactSystemLogReader } from "../modules/company/exact-system-log.reader";

export type FreshExactAppDependencies = Omit<AppDependencies,
  "companyService" | "financeService" | "inventoryService" | "invoiceModule" | "paymentModule" | "expensesModule"
> & {
  mode: "fresh-exact-selected";
  companyService: CompanyMetadataService;
  inventoryAttachmentService: Pick<InventoryService, "addInvoiceAttachments" | "getAttachmentDownload">;
  catalogService: Pick<InventoryService, "listItemDefinitions" | "listItemDefinitionOptions" | "getItemDefinition" | "createItemDefinition" | "updateItemDefinition">;
  financial: { services: FinancialDependencies; getMetadata(): Promise<WorkspaceMetadata>; reports: ExactReportCapability };
  listSystemLog: ExactSystemLogReader["listSystemLog"];
  payroll: { service: FinancialDependencies["payroll"]; opening: FinancialDependencies["opening"]; getEmployeePayroll: FinancialDependencies["lifecycle"]["getEmployeePayroll"] };
};

/** Exact application root used by normal startup; incompatible files are refused. */
export async function createFreshExactAppDependencies(
  config: CreateAppDependenciesConfig = {},
  appConfig: AppConfig = createAppConfig(),
): Promise<FreshExactAppDependencies> {
  if (appConfig.dbAdapter !== "sqlite") throw new Error("Selected exact root requires sqlite metadata on the shared connection");
  const databasePath = config.databasePath?.trim() ? config.databasePath : appConfig.databasePath;
  const databaseKey = config.databaseKey ?? appConfig.databaseKey;
  const connection = createDatabaseConnection(databasePath, databaseKey, { journalMode: "preserve" });
  let closed = false;
  const close = () => { if (!closed) { closed = true; connection.close(); } };
  try {
    await ensureFreshExactApplicationSchema(connection);
    // WAL persists header changes. Enable it only after the attestation
    // transaction commits, so refusing an incompatible file leaves it intact.
    connection.pragma("journal_mode = WAL");
    const db = createDrizzleFromSqlite(connection);
    const lock = createFifoLock({ timeoutMs: 30_000 });
    const auth = config.authInstance ?? createAuth(db, appConfig);
    const financial = createFinancialDependencies(connection, lock, { id: () => crypto.randomUUID(), now: () => new Date().toISOString() });
    const reports = createExactReportCapability(
      new ExactDebtReportReader(new SqliteExactDebtReportSnapshot(connection, lock, financial.financeRepository)),
      new ExactInventoryReports(new ExactInventoryReportSource(connection, lock)),
    );
    const systemLog = createExactSystemLogReader(connection, lock);
    const company = createCompanyRepository(connection, appConfig, lock);
    const mutation = new WorkspaceMutationContext(company, company);
    const workforceService = new WorkforceService(company, company, mutation, new SqliteEmployeeEarningRepository(connection, lock), {
      // Account existence, not nonzero balance: settled producer history also
      // prevents deleting its employee. The earning repository guards earnings.
      hasForEmployee: employeeId => financial.financeRepository.listAccounts().some(account => account.workerId === employeeId),
    });
    const operationsService = new OperationsService(company, company, mutation);
    const companyService = new CompanyMetadataService(workforceService, operationsService, new AuditService(company), new CounterpartyService(company, mutation));
    const roleModule = new RoleModule({ repository: new SqliteRbacRoleRepository(db) });
    const authBootstrapService = new AuthBootstrapService(new SqliteBootstrapPort(db, connection, lock), auth, appConfig.bootstrapSetupKey);
    // Reuse catalog validation without supplying a numeric debt/charge service.
    // Only catalog and attachment methods escape the selected composition root.
    // Attachment ownership selects the group ID, never retired numeric money columns.
    const catalog = new InventoryService(createInventoryRepository(connection, lock), new InventoryAttachmentStorage(appConfig.attachmentsRootPath), undefined, company);
    return {
      mode: "fresh-exact-selected",
      financial: { services: financial, getMetadata: async () => ({ ...companyService.getWorkspaceMetadata(), roles: await roleModule.list() }), reports },
      listSystemLog: systemLog.listSystemLog,
      payroll: { service: financial.payroll, opening: financial.opening, getEmployeePayroll: id => financial.lifecycle.getEmployeePayroll(id) },
      auth,
      accountService: new AccountService(new DrizzleAccountRepository(db, lock), auth),
      authBootstrapService,
      companyService,
      workforceService,
      operationsService,
      catalogService: {
        listItemDefinitions: catalog.listItemDefinitions.bind(catalog),
        listItemDefinitionOptions: catalog.listItemDefinitionOptions.bind(catalog),
        getItemDefinition: catalog.getItemDefinition.bind(catalog),
        createItemDefinition: catalog.createItemDefinition.bind(catalog),
        updateItemDefinition: catalog.updateItemDefinition.bind(catalog),
      },
      inventoryAttachmentService: {
        addInvoiceAttachments: catalog.addInvoiceAttachments.bind(catalog),
        getAttachmentDownload: catalog.getAttachmentDownload.bind(catalog),
      },
      sessionService: new SessionService(auth, new SqlitePermissionResolver(db, authBootstrapService)),
      recoveryKeyService: new RecoveryKeyService(new SqliteRecoveryKeyPort(db, connection, lock)),
      updateService: new UpdateService(),
      updateHistoryService: new UpdateHistoryService(new SqliteUpdateHistoryPort(connection, lock)),
      backupService: createBackupService({ snapshot: createWorkerSnapshotter({ databasePath, databaseKey }), backupsRootPath: config.backupsRootPath ?? appConfig.backupsRootPath, now: config.now }),
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
