import { implement, ORPCError } from "@orpc/server";

import { appContract, employeePayrollOutputSchema, payrollCashRecordSchema, payrollOffsetRecordSchema, payrollRepaymentRecordSchema } from "@tuari/contracts";

import { createAlgeriaTimestamp } from "../modules/company/company-time";
import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { CompanyService } from "../modules/company/company.service";
import type { WorkforceService } from "../modules/company/workforce.service";
import type { OperationsService } from "../modules/company/operations.service";
import type { FinanceService } from "../modules/company/finance.service";
import type { InventoryService } from "../modules/inventory/inventory.service";
import type { EmployeeModule } from "../modules/workforce/employee.module";
import type { InvoiceModule } from "../modules/invoice/invoice.module";
import type { PaymentModule } from "../modules/payment/payment-module.interface";
import type { ExpensesModule } from "../modules/expenses/expenses-module.interface";
import type { ProjectCostService } from "../modules/project-cost/project-cost.service";
import { getCurrentUser, type RpcContext } from "./context";
import { createRpcMiddleware } from "./rpc-middleware";
import { createPayrollRouter } from "./payroll-router";
import { createFinancialRouter, createUnavailableFinancialRouter } from "./financial-router";
import { createRetiredFinancialAction } from "./retired-financial-handlers";
import type { FreshExactAppDependencies, FreshExperimentalInvoiceSettlementAppDependencies } from "../app/fresh-exact-dependencies";
import type { PayrollService } from "../modules/workforce/payroll.service";
import type { PayrollLifecycle } from "../modules/workforce/payroll-lifecycle";
import type { PayrollOpeningService } from "../modules/workforce/payroll-opening.service";
import { createPayrollOpeningRouter } from "./payroll-opening-router";
import { resolveError as resolvePayrollError } from "./payroll-router";
import { createWorkforceHandlers } from "./handlers/workforce";
import { createOperationsHandlers } from "./handlers/operations";
import { createFinanceHandlers, createCounterpartyHandlers } from "./handlers/finance";
import { createInventoryHandlers, createCatalogHandlers } from "./handlers/inventory";
import { createSystemHandlers } from "./handlers/system";
import { createReportsHandlers } from "./handlers/reports";
import { createInvoiceHandlers } from "./handlers/invoice";
import { createPaymentHandlers } from "./handlers/payment";
import { createExpensesHandlers } from "./handlers/expenses";
import { createProjectCostHandlers } from "./handlers/project-cost";
import { createUpdateHandlers } from "./handlers/update";
import { createRbacHandlers } from "./handlers/rbac";
import { createBackupHandlers } from "./handlers/backup";

import type { RecoveryKeyService } from "../modules/auth/recovery-key.service";
import type { UpdateHistoryService } from "../modules/update/update-history.service";
import type { UpdateService } from "../modules/update/update.service";
import type { RoleModule } from "../modules/rbac/role.module";
import type { DatabaseKeyManager } from "../infrastructure/database/database-key-manager";
import type { DatabaseKeyPersister } from "../infrastructure/database/database-key-persister";
import type { BackupService } from "../modules/backup/backup.types";
import type { BackupFolderPersister } from "../infrastructure/config/backup-folder-persister";

/** Legacy fixture/default graph. It cannot masquerade as the selected exact graph. */
type RouterDependencies = {
  /** Caller-owned exact capability. Absence must never revive numeric payroll. */
  payroll?: {
    service: PayrollService;
    opening?: PayrollOpeningService;
    getEmployeePayroll: (employeeId: string) => PayrollLifecycle;
  };
  authBootstrapService: Pick<AuthBootstrapService, "getSetupStatus" | "bootstrapFirstUser" | "isBootstrapOwner">;
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
  recoveryKeyService: RecoveryKeyService;
  updateService: UpdateService;
  updateHistoryService: UpdateHistoryService;
  roleModule: RoleModule;
  databaseKeyManager: DatabaseKeyManager;
  databaseKeyPersister: DatabaseKeyPersister;
  backupService: BackupService;
  backupFolderPersister: BackupFolderPersister;
};

export function createRouter(
  dependencies: RouterDependencies | FreshExactAppDependencies | FreshExperimentalInvoiceSettlementAppDependencies,
  options: { trustProxyHeaders?: boolean } = {},
) {
  const os = implement(appContract).$context<RpcContext>();
  const m = createRpcMiddleware({
    authBootstrapService: dependencies.authBootstrapService,
    trustProxyHeaders: options.trustProxyHeaders,
  });

  const baseHandlers = {
    health: os.health.handler(() => ({
      status: "ok",
      timestamp: createAlgeriaTimestamp(),
    })),
    session: os.session.handler(async ({ context }) => ({
      user: await getCurrentUser(context),
    })),
    authSetupStatus: os.authSetupStatus.handler(async () =>
      dependencies.authBootstrapService.getSetupStatus(),
    ),
    authBootstrap: os.authBootstrap.handler(async ({ context, input }) => {
      // Defense-in-depth (#175): the setup secret is the one in-scope
      // credential verified by an unauthenticated endpoint. Charge it against
      // the shared per-IP budget (same socket-keyed limiter as the auth routes)
      // so the strong secret is additionally protected against online guessing.
      m.rateLimit(context);
      return dependencies.authBootstrapService.bootstrapFirstUser(input);
    }),
  };

  const payrollUnavailable = () => { throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Exact payroll composition is not configured" }); };
  const payrollHandlers = dependencies.payroll
    ? createPayrollRouter(dependencies.payroll.service, dependencies.payroll.getEmployeePayroll, m, dependencies.payroll.opening)
    : {
    ...createPayrollOpeningRouter(undefined, m, resolvePayrollError),
    employeePayrollGet: os.employeePayrollGet.handler(async params => employeePayrollOutputSchema.parse(await m.queryAuth(async () => payrollUnavailable())(params))),
    employeePayrollCashRecord: os.employeePayrollCashRecord.handler(async params => payrollCashRecordSchema.parse(await m.mutationAudit(() => payrollUnavailable(), error => error)(params))),
    employeePayrollAdvanceRepay: os.employeePayrollAdvanceRepay.handler(async params => payrollRepaymentRecordSchema.parse(await m.mutationAudit(() => payrollUnavailable(), error => error)(params))),
    employeePayrollAdvanceOffset: os.employeePayrollAdvanceOffset.handler(async params => payrollOffsetRecordSchema.parse(await m.mutationAudit(() => payrollUnavailable(), error => error)(params))),
  };
  if ("mode" in dependencies) {
    // Exact reports use their own contract. The legacy numeric report stays unavailable.
    const unavailable = m.queryAuth(async () => {
      throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Use financial.reports.generate for exact reports; selected root is not production activation" });
    });
    const refuse = createRetiredFinancialAction(m);
    // Explicit leaves preserve compiler checking when the public contract grows.
    const retired = {
      inventoryInvoiceGroupsList: os.inventoryInvoiceGroupsList.handler(refuse),
      inventoryInvoiceGroupsGet: os.inventoryInvoiceGroupsGet.handler(refuse),
      inventoryInvoiceGroupsCreate: os.inventoryInvoiceGroupsCreate.handler(refuse),
      inventoryReceive: os.inventoryReceive.handler(refuse),
      inventoryLocationContentsGet: os.inventoryLocationContentsGet.handler(refuse),
      inventoryAssetsGet: os.inventoryAssetsGet.handler(refuse),
      inventoryAssetsTransfer: os.inventoryAssetsTransfer.handler(refuse),
      inventoryAssetChargeDefault: os.inventoryAssetChargeDefault.handler(refuse),
      inventoryAssetChargesListByUnit: os.inventoryAssetChargesListByUnit.handler(refuse),
      inventoryAssetChargesListByProject: os.inventoryAssetChargesListByProject.handler(refuse),
      inventoryAssetChargesUpdate: os.inventoryAssetChargesUpdate.handler(refuse),
      inventoryAssetChargesVoid: os.inventoryAssetChargesVoid.handler(refuse),
      inventoryConsumablesTransfer: os.inventoryConsumablesTransfer.handler(refuse),
      inventoryInvoiceGroupsRecordPayment: os.inventoryInvoiceGroupsRecordPayment.handler(refuse),
      inventoryOutboundTransfersList: os.inventoryOutboundTransfersList.handler(refuse),
      inventoryOutboundTransfersCreate: os.inventoryOutboundTransfersCreate.handler(refuse),
      inventoryTransferHistoryList: os.inventoryTransferHistoryList.handler(refuse),
      debtAccountsList: os.debtAccountsList.handler(refuse),
      debtAccountsGet: os.debtAccountsGet.handler(refuse),
      debtAccountsCreate: os.debtAccountsCreate.handler(refuse),
      debtEntriesList: os.debtEntriesList.handler(refuse),
      debtEntriesCreate: os.debtEntriesCreate.handler(refuse),
      debtEntriesRecordPayment: os.debtEntriesRecordPayment.handler(refuse),
      debtEntriesVoid: os.debtEntriesVoid.handler(refuse),
      debtEntriesConsolidate: os.debtEntriesConsolidate.handler(refuse),
      debtAccountsSettle: os.debtAccountsSettle.handler(refuse),
      debtPartyDetail: os.debtPartyDetail.handler(refuse),
      debtsSummary: os.debtsSummary.handler(refuse),
      employeeDebtEntryCreate: os.employeeDebtEntryCreate.handler(refuse),
      invoicesList: os.invoicesList.handler(refuse),
      invoicesGet: os.invoicesGet.handler(refuse),
      invoicesCreate: os.invoicesCreate.handler(refuse),
      invoicesUpdate: os.invoicesUpdate.handler(refuse),
      invoicesDelete: os.invoicesDelete.handler(refuse),
      invoicesReceive: os.invoicesReceive.handler(refuse),
      invoicesMarkPaid: os.invoicesMarkPaid.handler(refuse),
      paymentsList: os.paymentsList.handler(refuse),
      paymentsGet: os.paymentsGet.handler(refuse),
      paymentsCreate: os.paymentsCreate.handler(refuse),
      paymentsDelete: os.paymentsDelete.handler(refuse),
      expensesList: os.expensesList.handler(refuse),
      expensesGet: os.expensesGet.handler(refuse),
      expensesCreate: os.expensesCreate.handler(refuse),
      expensesUpdate: os.expensesUpdate.handler(refuse),
      expensesVoid: os.expensesVoid.handler(refuse),
    };
    const financialRouter = dependencies.mode === "fresh-experimental-invoice-settlement"
      ? createFinancialRouter({ ...dependencies.financial.services, invoices: undefined }, dependencies.financial.getMetadata, m, dependencies.financial.reports, dependencies.financial.manualSettlement, dependencies.financial.services.experimentalInvoices, dependencies.financial.manualSettlement)
      : createFinancialRouter(dependencies.financial.services, dependencies.financial.getMetadata, m, dependencies.financial.reports, dependencies.financial.manualSettlement);
    return os.router({
      ...retired,
      ...baseHandlers,
      ...payrollHandlers,
      financial: financialRouter,
      ...createWorkforceHandlers(os, m, dependencies.workforceService, dependencies.employeeModule),
      salaryPaymentsList: os.salaryPaymentsList.handler(refuse),
      salaryPaymentsCreate: os.salaryPaymentsCreate.handler(refuse),
      ...createOperationsHandlers(os, m, dependencies.operationsService),
      ...createCounterpartyHandlers(os, m, dependencies.companyService),
      ...createCatalogHandlers(os, m, dependencies.catalogService),
      ...createSystemHandlers(os, m, {
        getWorkspaceSnapshot: () => { throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Use financial.metadata" }); },
        listSystemLog: dependencies.listSystemLog,
      }, dependencies.recoveryKeyService, dependencies.roleModule, dependencies.databaseKeyManager, dependencies.databaseKeyPersister),
      ...createProjectCostHandlers(os, m, dependencies.projectCostService),
      ...createUpdateHandlers(os, m, dependencies.updateService, dependencies.updateHistoryService),
      ...createBackupHandlers(os, m, dependencies.backupService, dependencies.backupFolderPersister),
      ...createRbacHandlers(os, m, dependencies.roleModule),
      reportsGenerate: os.reportsGenerate.handler(unavailable),
    });
  }
  const legacy = dependencies;
  const allHandlers = {
    financial: createUnavailableFinancialRouter(m),
    ...baseHandlers,
    ...payrollHandlers,
    ...createSystemHandlers(os, m, legacy.companyService, legacy.recoveryKeyService, legacy.roleModule, legacy.databaseKeyManager, legacy.databaseKeyPersister),
    ...createWorkforceHandlers(os, m, legacy.workforceService, legacy.employeeModule),
    ...createOperationsHandlers(os, m, legacy.operationsService),
    ...createFinanceHandlers(os, m, legacy.financeService),
    ...createInventoryHandlers(os, m, legacy.inventoryService),
    ...createReportsHandlers(os, m, legacy.financeService, legacy.inventoryService),
    ...createInvoiceHandlers(os, m, legacy.invoiceModule),
    ...createPaymentHandlers(os, m, legacy.paymentModule),
    ...createExpensesHandlers(os, m, legacy.expensesModule),
    ...createProjectCostHandlers(os, m, legacy.projectCostService),
    ...createUpdateHandlers(os, m, legacy.updateService, legacy.updateHistoryService),
    ...createBackupHandlers(os, m, legacy.backupService, legacy.backupFolderPersister),
    ...createRbacHandlers(os, m, legacy.roleModule),
  };

  return os.router(allHandlers);
}
