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
import { recurringPatternsContract } from "./recurring-contract"
import { invoiceContract } from "./invoice-contract"

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
  ...recurringPatternsContract,
  ...invoiceContract,
} as const

export type AppContract = typeof appContract
export type AppClient = ContractRouterClient<AppContract>
