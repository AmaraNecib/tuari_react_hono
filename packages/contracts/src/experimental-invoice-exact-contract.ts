import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";
import { entityIdSchema } from "./core";
import {
  exactInvoiceCreateSchema, exactInvoiceUpdateSchema, exactInvoiceCommandSchema, exactInvoiceVoidSchema,
  experimentalExactInvoiceListSchema, experimentalExactInvoiceSchema,
  exactPaymentSchema, exactPaymentCreateSchema, exactPaymentAllocateSchema, exactPaymentListSchema,
  exactInvoiceEqualSplitSchema, exactInvoicePositiveAmountSchema,
} from "./invoice-exact";

const removed = z.object({ id: entityIdSchema });
const page = <T extends z.ZodType>(schema: T) => z.object({ items: z.array(schema), totalCount: z.number().int().nonnegative(), hasMore: z.boolean(), nextCursor: z.string().nullable() });

/** Invoice settlement wire contract. Installed only by the explicit experimental root. */
export const experimentalExactInvoicesContract = {
  getInvoice: oc.input(removed).output(experimentalExactInvoiceSchema),
  listInvoices: oc.input(experimentalExactInvoiceListSchema).output(page(experimentalExactInvoiceSchema)),
  createInvoice: oc.input(exactInvoiceCreateSchema).output(experimentalExactInvoiceSchema),
  updateInvoice: oc.input(exactInvoiceUpdateSchema).output(experimentalExactInvoiceSchema),
  receiveInvoice: oc.input(exactInvoiceCommandSchema).output(experimentalExactInvoiceSchema),
  voidInvoice: oc.input(exactInvoiceVoidSchema).output(experimentalExactInvoiceSchema),
  deleteDraft: oc.input(exactInvoiceCommandSchema).output(removed),
  getPayment: oc.input(removed).output(exactPaymentSchema),
  listPayments: oc.input(exactPaymentListSchema).output(page(exactPaymentSchema)),
  createPayment: oc.input(exactPaymentCreateSchema).output(exactPaymentSchema),
  allocatePayment: oc.input(exactPaymentAllocateSchema).output(exactPaymentSchema),
  voidPayment: oc.input(exactInvoiceVoidSchema).output(exactPaymentSchema),
  deleteUnallocatedPayment: oc.input(exactInvoiceCommandSchema).output(removed),
  splitPayment: oc.input(exactInvoiceEqualSplitSchema).output(z.array(z.object({ invoiceId: entityIdSchema, amount: exactInvoicePositiveAmountSchema }))),
} as const;
export type ExperimentalExactInvoicesClient = ContractRouterClient<typeof experimentalExactInvoicesContract>;
