import { oc } from "@orpc/contract"
import { z } from "zod"

import {
  createDeleteResultSchema,
  createEntityResultSchema,
  createListSchema,
  entityIdSchema,
  idInputSchema,
} from "./core"
import {
  debtAccountCreateInputSchema,
  debtAccountListInputSchema,
  debtAccountSchema,
  debtEntryCreateInputSchema,
  debtEntryRecordPaymentInputSchema,
  debtEntrySchema,
  debtConsolidationInputSchema,
  debtEntryVoidInputSchema,
  debtPartyDetailInputSchema,
  debtPartyDetailSchema,
  debtSettlementInputSchema,
  debtsSummarySchema,
  employeeDebtAccountGetInputSchema,
  employeeDebtEntryCreateInputSchema,
  externalCounterpartyCreateInputSchema,
  externalCounterpartyListInputSchema,
  externalCounterpartySchema,
} from "./debts"

export const debtsContract = {
  debtAccountsList: oc
    .input(debtAccountListInputSchema)
    .output(createListSchema(debtAccountSchema)),
  debtAccountsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(debtAccountSchema)),
  debtAccountsCreate: oc
    .input(debtAccountCreateInputSchema)
    .output(createEntityResultSchema(debtAccountSchema)),
  debtEntriesList: oc
    .input(z.object({ debtAccountId: entityIdSchema }))
    .output(createListSchema(debtEntrySchema)),
  debtEntriesCreate: oc
    .input(debtEntryCreateInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  debtEntriesRecordPayment: oc
    .input(debtEntryRecordPaymentInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  debtEntriesVoid: oc
    .input(debtEntryVoidInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  debtEntriesConsolidate: oc
    .input(debtConsolidationInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  debtAccountsSettle: oc
    .input(debtSettlementInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  debtPartyDetail: oc
    .input(debtPartyDetailInputSchema)
    .output(createEntityResultSchema(debtPartyDetailSchema)),
  debtsSummary: oc.output(debtsSummarySchema),
  externalCounterpartiesList: oc
    .input(externalCounterpartyListInputSchema)
    .output(createListSchema(externalCounterpartySchema)),
  externalCounterpartiesGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(externalCounterpartySchema)),
  externalCounterpartiesCreate: oc
    .input(externalCounterpartyCreateInputSchema)
    .output(createEntityResultSchema(externalCounterpartySchema)),
  employeeDebtEntryCreate: oc
    .input(employeeDebtEntryCreateInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  employeeDebtAccountGet: oc
    .input(employeeDebtAccountGetInputSchema)
    .output(createEntityResultSchema(debtAccountSchema)),
} as const

export type DebtsContract = typeof debtsContract
