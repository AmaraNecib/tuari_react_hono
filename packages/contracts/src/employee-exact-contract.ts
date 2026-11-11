import { oc, type ContractRouterClient } from "@orpc/contract";
import { createDeleteResultSchema, createEntityResultSchema, createListSchema, idInputSchema, paginatedResultSchema } from "./core";
import { employeeAssignWorkplaceInputSchema, employeeListInputSchema, employeePagedListInputSchema, employeeStateHistoryListInputSchema, employeeSyncManagedProjectsInputSchema, employeeSyncManagedWarehousesInputSchema } from "./workforce";
import { exactEmployeeSchema, exactEmployeeStateHistorySchema, exactEmployeeCreateInputSchema, exactEmployeeUpdateInputSchema, exactEmployeeBatchCreateInputSchema, exactEmployeeBatchCreateResultSchema, exactEmployeeSaveInputSchema } from "./workforce-exact";

/** Root replaces these numeric employee methods in exact mode; never mounts a parallel employee namespace. */
export const exactEmployeeContract = {
  employeesList: oc.input(employeeListInputSchema).output(createListSchema(exactEmployeeSchema)),
  employeesListPaged: oc.input(employeePagedListInputSchema).output(paginatedResultSchema(exactEmployeeSchema)),
  employeesGet: oc.input(idInputSchema).output(createEntityResultSchema(exactEmployeeSchema)),
  employeesCreate: oc.input(exactEmployeeCreateInputSchema).output(createEntityResultSchema(exactEmployeeSchema)),
  employeesBatchCreate: oc.input(exactEmployeeBatchCreateInputSchema).output(createEntityResultSchema(exactEmployeeBatchCreateResultSchema)),
  employeesUpdate: oc.input(exactEmployeeUpdateInputSchema).output(createEntityResultSchema(exactEmployeeSchema)),
  employeesSave: oc.input(exactEmployeeSaveInputSchema).output(createEntityResultSchema(exactEmployeeSchema)),
  employeesDelete: oc.input(idInputSchema).output(createDeleteResultSchema),
  employeesAssignWorkplace: oc.input(employeeAssignWorkplaceInputSchema).output(createDeleteResultSchema),
  employeesSyncManagedProjects: oc.input(employeeSyncManagedProjectsInputSchema).output(createDeleteResultSchema),
  employeesSyncManagedWarehouses: oc.input(employeeSyncManagedWarehousesInputSchema).output(createDeleteResultSchema),
  employeeStateHistoryList: oc.input(employeeStateHistoryListInputSchema).output(createListSchema(exactEmployeeStateHistorySchema)),
} as const;
export type ExactEmployeeClient = ContractRouterClient<typeof exactEmployeeContract>;
