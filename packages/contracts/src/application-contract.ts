import { oc } from "@orpc/contract";
import { z } from "zod";
import { healthCheckSchema } from "./core";
import { authContract } from "./auth-contract";
import { workforceContract } from "./workforce-contract";
import { exactEmployeeContract } from "./employee-exact-contract";
import { operationsContract } from "./operations-contract";
import { backupContract } from "./backup-contract";
import { rbacContract } from "./rbac-contract";
import { exactWorkforceEarningsContract } from "./workforce-exact-contract";
import { systemContract } from "./system-contract";
import type { ContractRouterClient } from "@orpc/contract";

const nonfinancialWorkforceContract = {
  rolesList: workforceContract.rolesList,
  rolesGet: workforceContract.rolesGet,
  managerAssignmentsList: workforceContract.managerAssignmentsList,
  projectAssignmentsList: workforceContract.projectAssignmentsList,
  projectAssignmentsGet: workforceContract.projectAssignmentsGet,
  projectAssignmentsCreate: workforceContract.projectAssignmentsCreate,
  projectAssignmentsEnd: workforceContract.projectAssignmentsEnd,
  warehouseAssignmentsList: workforceContract.warehouseAssignmentsList,
  warehouseAssignmentsGet: workforceContract.warehouseAssignmentsGet,
  warehouseAssignmentsCreate: workforceContract.warehouseAssignmentsCreate,
  warehouseAssignmentsEnd: workforceContract.warehouseAssignmentsEnd,
};

export const applicationCapabilitiesSchema = z.object({
  workspaceId: z.uuid(),
  employees: z.literal("exact"),
  approvedEarnings: z.literal("available"),
  projectLaborCost: z.literal("exact-ledger"),
  cashPayments: z.literal("unavailable"),
  advances: z.literal("unavailable"),
  openings: z.literal("unavailable"),
  corrections: z.literal("unavailable"),
  invoices: z.literal("unavailable"),
  inventoryMoney: z.literal("unavailable"),
  expenses: z.literal("unavailable"),
  monetaryReports: z.literal("unavailable"),
  fullProjectCost: z.literal("unavailable"),
}).strict();

export type ApplicationCapabilities = z.infer<typeof applicationCapabilitiesSchema>;

const applicationSecurityContract = {
  getRecoveryKeyPool: systemContract.getRecoveryKeyPool,
  generateRecoveryKeys: systemContract.generateRecoveryKeys,
  consumeRecoveryKey: systemContract.consumeRecoveryKey,
  revokeRecoveryKey: systemContract.revokeRecoveryKey,
  changeDbEncryptionKey: systemContract.changeDbEncryptionKey,
} as const;

export const applicationCapabilitiesContract = {
  applicationCapabilities: oc.output(applicationCapabilitiesSchema),
} as const;

/** Normal application contract. Employee method names stay top-level. */
export const applicationContract = {
  health: oc.output(healthCheckSchema),
  ...authContract,
  ...nonfinancialWorkforceContract,
  ...exactEmployeeContract,
  ...operationsContract,
  ...backupContract,
  ...rbacContract,
  ...applicationSecurityContract,
  ...applicationCapabilitiesContract,
  workforceExact: exactWorkforceEarningsContract,
} as const;

export type ApplicationContract = typeof applicationContract;
export type ApplicationClient = ContractRouterClient<ApplicationContract>;
