import { oc } from "@orpc/contract"

import {
  createDeleteResultSchema,
  createEntityResultSchema,
  createListSchema,
  idInputSchema,
} from "./core"
import {
  projectCreateInputSchema,
  projectListInputSchema,
  projectManagerOwnershipHistoryListInputSchema,
  projectManagerOwnershipHistorySchema,
  projectSchema,
  projectUpdateInputSchema,
} from "./projects"
import {
  warehouseCreateInputSchema,
  warehouseListInputSchema,
  warehouseManagerOwnershipHistoryListInputSchema,
  warehouseManagerOwnershipHistorySchema,
  warehouseSchema,
  warehouseUpdateInputSchema,
} from "./warehouses"

export const operationsContract = {
  projectsList: oc.input(projectListInputSchema).output(createListSchema(projectSchema)),
  projectsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(projectSchema)),
  projectsCreate: oc
    .input(projectCreateInputSchema)
    .output(createEntityResultSchema(projectSchema)),
  projectsUpdate: oc
    .input(projectUpdateInputSchema)
    .output(createEntityResultSchema(projectSchema)),
  warehousesList: oc
    .input(warehouseListInputSchema)
    .output(createListSchema(warehouseSchema)),
  warehousesGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(warehouseSchema)),
  warehousesCreate: oc
    .input(warehouseCreateInputSchema)
    .output(createEntityResultSchema(warehouseSchema)),
  warehousesUpdate: oc
    .input(warehouseUpdateInputSchema)
    .output(createEntityResultSchema(warehouseSchema)),
  projectManagerOwnershipHistoryList: oc
    .input(projectManagerOwnershipHistoryListInputSchema)
    .output(createListSchema(projectManagerOwnershipHistorySchema)),
  warehouseManagerOwnershipHistoryList: oc
    .input(warehouseManagerOwnershipHistoryListInputSchema)
    .output(createListSchema(warehouseManagerOwnershipHistorySchema)),
} as const

export type OperationsContract = typeof operationsContract
