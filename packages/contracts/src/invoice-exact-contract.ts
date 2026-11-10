import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";
import { entityIdSchema } from "./core";
import {
  exactInvoiceSchema, exactInvoiceCreateSchema, exactInvoiceUpdateSchema, exactInvoiceCommandSchema, exactInvoiceVoidSchema, exactInvoiceListSchema,
  exactPaymentSchema, exactPaymentCreateSchema, exactPaymentAllocateSchema, exactPaymentListSchema,
  exactInvoiceEqualSplitSchema, exactInvoicePositiveAmountSchema,
} from "./invoice-exact";

const removed = z.object({ id: entityIdSchema });
const page = <T extends z.ZodType>(schema: T) => z.object({ items: z.array(schema), totalCount: z.number().int().nonnegative(), hasMore: z.boolean(), nextCursor: z.string().nullable() });
/** Separate opt-in composition. Never added to the numeric appContract. */
export const exactInvoicesContract = {
  getInvoice: oc.input(removed).output(exactInvoiceSchema),
  listInvoices: oc.input(exactInvoiceListSchema).output(page(exactInvoiceSchema)),
  createInvoice: oc.input(exactInvoiceCreateSchema).output(exactInvoiceSchema),
  updateInvoice: oc.input(exactInvoiceUpdateSchema).output(exactInvoiceSchema),
  receiveInvoice: oc.input(exactInvoiceCommandSchema).output(exactInvoiceSchema),
  voidInvoice: oc.input(exactInvoiceVoidSchema).output(exactInvoiceSchema),
  deleteDraft: oc.input(exactInvoiceCommandSchema).output(removed),
  getPayment: oc.input(removed).output(exactPaymentSchema),
  listPayments: oc.input(exactPaymentListSchema).output(page(exactPaymentSchema)),
  createPayment: oc.input(exactPaymentCreateSchema).output(exactPaymentSchema),
  allocatePayment: oc.input(exactPaymentAllocateSchema).output(exactPaymentSchema),
  voidPayment: oc.input(exactInvoiceVoidSchema).output(exactPaymentSchema),
  deleteUnallocatedPayment: oc.input(exactInvoiceCommandSchema).output(removed),
  splitPayment: oc.input(exactInvoiceEqualSplitSchema).output(z.array(z.object({ invoiceId: entityIdSchema, amount: exactInvoicePositiveAmountSchema }))),
} as const;
export type ExactInvoicesClient = ContractRouterClient<typeof exactInvoicesContract>;
