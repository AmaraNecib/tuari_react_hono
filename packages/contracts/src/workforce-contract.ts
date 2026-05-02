import { oc } from "@orpc/contract"
import { z } from "zod"

import {
  createDeleteResultSchema,
  createEntityResultSchema,
  createListSchema,
  idInputSchema,
} from "./core"
import {
  employeeAssignWorkplaceInputSchema,
  employeeBatchCreateInputSchema,
  employeeBatchCreateResultSchema,
  employeeCreateInputSchema,
  employeeListInputSchema,
  employeeManagerAssignmentSchema,
  employeeProjectAssignmentSchema,
  employeeSalaryPaymentCreateInputSchema,
  employeeSalaryPaymentListInputSchema,
  employeeSalaryPaymentSchema,
  employeeSchema,
  employeeStateHistoryListInputSchema,
  employeeStateHistorySchema,
  employeeSyncManagedProjectsInputSchema,
  employeeSyncManagedWarehousesInputSchema,
  employeeUpdateInputSchema,
  employeeWarehouseAssignmentSchema,
  managerAssignmentCreateInputSchema,
  managerAssignmentEndInputSchema,
  managerAssignmentListInputSchema,
  projectAssignmentCreateInputSchema,
  projectAssignmentEndInputSchema,
  projectAssignmentListInputSchema,
  roleCreateInputSchema,
  roleSchema,
  roleUpdateInputSchema,
  warehouseAssignmentCreateInputSchema,
  warehouseAssignmentEndInputSchema,
  warehouseAssignmentListInputSchema,
} from "./workforce"

export const workforceContract = {
  rolesList: oc.output(createListSchema(roleSchema)),
  rolesGet: oc.input(idInputSchema).output(createEntityResultSchema(roleSchema)),
  rolesCreate: oc
    .input(roleCreateInputSchema)
    .output(createEntityResultSchema(roleSchema)),
  rolesUpdate: oc
    .input(roleUpdateInputSchema)
    .output(createEntityResultSchema(roleSchema)),
  rolesDelete: oc.input(idInputSchema).output(createDeleteResultSchema),
  employeesList: oc
    .input(employeeListInputSchema)
    .output(createListSchema(employeeSchema)),
  employeesGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeSchema)),
  employeesCreate: oc
    .input(employeeCreateInputSchema)
    .output(createEntityResultSchema(employeeSchema)),
  employeesBatchCreate: oc
    .input(employeeBatchCreateInputSchema)
    .output(createEntityResultSchema(employeeBatchCreateResultSchema)),
  employeesUpdate: oc
    .input(employeeUpdateInputSchema)
    .output(createEntityResultSchema(employeeSchema)),
  employeesDelete: oc.input(idInputSchema).output(createDeleteResultSchema),
  employeesAssignWorkplace: oc
    .input(employeeAssignWorkplaceInputSchema)
    .output(createDeleteResultSchema),
  employeesSyncManagedProjects: oc
    .input(employeeSyncManagedProjectsInputSchema)
    .output(createDeleteResultSchema),
  employeesSyncManagedWarehouses: oc
    .input(employeeSyncManagedWarehousesInputSchema)
    .output(createDeleteResultSchema),
  managerAssignmentsList: oc
    .input(managerAssignmentListInputSchema)
    .output(createListSchema(employeeManagerAssignmentSchema)),
  managerAssignmentsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeManagerAssignmentSchema)),
  managerAssignmentsCreate: oc
    .input(managerAssignmentCreateInputSchema)
    .output(createEntityResultSchema(employeeManagerAssignmentSchema)),
  managerAssignmentsEnd: oc
    .input(managerAssignmentEndInputSchema)
    .output(createEntityResultSchema(employeeManagerAssignmentSchema)),
  projectAssignmentsList: oc
    .input(projectAssignmentListInputSchema)
    .output(createListSchema(employeeProjectAssignmentSchema)),
  projectAssignmentsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeProjectAssignmentSchema)),
  projectAssignmentsCreate: oc
    .input(projectAssignmentCreateInputSchema)
    .output(createEntityResultSchema(employeeProjectAssignmentSchema)),
  projectAssignmentsEnd: oc
    .input(projectAssignmentEndInputSchema)
    .output(createEntityResultSchema(employeeProjectAssignmentSchema)),
  warehouseAssignmentsList: oc
    .input(warehouseAssignmentListInputSchema)
    .output(createListSchema(employeeWarehouseAssignmentSchema)),
  warehouseAssignmentsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeWarehouseAssignmentSchema)),
  warehouseAssignmentsCreate: oc
    .input(warehouseAssignmentCreateInputSchema)
    .output(createEntityResultSchema(employeeWarehouseAssignmentSchema)),
  warehouseAssignmentsEnd: oc
    .input(warehouseAssignmentEndInputSchema)
    .output(createEntityResultSchema(employeeWarehouseAssignmentSchema)),
  employeeStateHistoryList: oc
    .input(employeeStateHistoryListInputSchema)
    .output(createListSchema(employeeStateHistorySchema)),
  salaryPaymentsList: oc
    .input(employeeSalaryPaymentListInputSchema)
    .output(createListSchema(employeeSalaryPaymentSchema)),
  salaryPaymentsCreate: oc
    .input(employeeSalaryPaymentCreateInputSchema)
    .output(createEntityResultSchema(employeeSalaryPaymentSchema)),
} as const

export type WorkforceContract = typeof workforceContract
