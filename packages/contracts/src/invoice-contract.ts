import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  invoiceSchema,
  invoiceCreateInputSchema,
  invoiceUpdateInputSchema,
  invoiceListInputSchema,
  invoiceMarkPaidInputSchema,
} from "./invoice";

const invoiceListOutputSchema = z.object({
  items: z.array(invoiceSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number(),
  hasMore: z.boolean(),
});

const receiveInvoiceOutputSchema = z.object({
  invoice: invoiceSchema,
  debtEntryId: z.string(),
});

export const invoiceContract = {
  invoicesList: oc
    .input(invoiceListInputSchema)
    .output(invoiceListOutputSchema),

  invoicesGet: oc
    .input(z.object({ id: z.string().uuid() }))
    .output(invoiceSchema),

  invoicesCreate: oc
    .input(invoiceCreateInputSchema)
    .output(invoiceSchema),

  invoicesUpdate: oc
    .input(invoiceUpdateInputSchema)
    .output(invoiceSchema),

  invoicesDelete: oc
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() })),

  invoicesReceive: oc
    .input(z.object({ id: z.string().uuid() }))
    .output(receiveInvoiceOutputSchema),

  invoicesMarkPaid: oc
    .input(invoiceMarkPaidInputSchema)
    .output(invoiceSchema),
};
