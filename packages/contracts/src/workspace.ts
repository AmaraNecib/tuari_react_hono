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
  roleSchema,
} from "./workforce";

export const workspaceSnapshotSchema = z.object({
  roles: z.array(roleSchema),
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

export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
