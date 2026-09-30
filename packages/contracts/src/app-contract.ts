import { oc, type ContractRouterClient } from "@orpc/contract"

import { healthCheckSchema } from "./core"
import { workspaceSnapshotSchema } from "./workspace"
import { authContract } from "./auth-contract"
import { workforceContract } from "./workforce-contract"
import { operationsContract } from "./operations-contract"
import { inventoryContract } from "./inventory-contract"
import { debtsContract } from "./debts-contract"
import { systemContract } from "./system-contract"
import { reportsContract } from "./reports-contract"
import { invoiceContract } from "./invoice-contract"
import { paymentContract } from "./payment-contract"
import { expensesContract } from "./expenses-contract"
import { projectCostContract } from "./project-cost-contract"
import { updateContract } from "./update-contract"
import { backupContract } from "./backup-contract"
import { rbacContract } from "./rbac-contract"

export const appContract = {
  health: oc.output(healthCheckSchema),
  workspaceSnapshot: oc.output(workspaceSnapshotSchema),
  ...authContract,
  ...workforceContract,
  ...operationsContract,
  ...inventoryContract,
  ...debtsContract,
  ...systemContract,
  ...reportsContract,
  ...invoiceContract,
  ...paymentContract,
  ...expensesContract,
  ...projectCostContract,
  ...updateContract,
  ...backupContract,
  ...rbacContract,
} as const

export type AppContract = typeof appContract
export type AppClient = ContractRouterClient<AppContract>
