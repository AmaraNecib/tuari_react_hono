import { z } from "zod";

import { debtAccountSchema, debtEntrySchema, externalCounterpartySchema } from "./debts";
import { projectManagerOwnershipHistorySchema, projectSchema } from "./projects";
import { warehouseManagerOwnershipHistorySchema, warehouseSchema } from "./warehouses";
import {
  employeeManagerAssignmentSchema,
  employeeProjectAssignmentSchema,
  employeeSalaryPaymentSchema,
  employeeSchema,
  employeeStateHistorySchema,
  employeeWarehouseAssignmentSchema,
} from "./workforce";
import { roleWithPermissionsSchema } from "./rbac-contract";

export const workspaceSnapshotSchema = z.object({
  roles: z.array(roleWithPermissionsSchema),
  employees: z.array(employeeSchema),
  externalCounterparties: z.array(externalCounterpartySchema),
  debtAccounts: z.array(debtAccountSchema),
  debtEntries: z.array(debtEntrySchema),
  projects: z.array(projectSchema),
  warehouses: z.array(warehouseSchema),
  managerAssignments: z.array(employeeManagerAssignmentSchema),
  projectAssignments: z.array(employeeProjectAssignmentSchema),
  warehouseAssignments: z.array(employeeWarehouseAssignmentSchema),
  employeeStateHistory: z.array(employeeStateHistorySchema),
  projectManagerOwnershipHistory: z.array(projectManagerOwnershipHistorySchema),
  warehouseManagerOwnershipHistory: z.array(warehouseManagerOwnershipHistorySchema),
  salaryPayments: z.array(employeeSalaryPaymentSchema),
});

/** Organizational state is independent of exact financial balance and cash reads. */
export const workspaceMetadataSchema = workspaceSnapshotSchema.omit({
  debtAccounts: true,
  debtEntries: true,
  salaryPayments: true,
}).extend({
  // Composition support, not a permission grant or a persisted setting.
  capabilities: z.object({ manualSettlement: z.boolean(), experimentalInvoiceSettlement: z.boolean().optional(), experimentalSettlement: z.boolean().optional() }).strict().optional(),
}).strict();

export type WorkspaceMetadata = z.infer<typeof workspaceMetadataSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
