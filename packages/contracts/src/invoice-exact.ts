import { z } from "zod";
import { Quantity, parseExactLine } from "./exact-money";
import { exactDebtAmountSchema } from "./debts-exact";
import { invoiceDirectionSchema } from "./invoice";
import { counterpartyTypeSchema } from "./payment";
import { entityIdSchema, paymentMethodSchema, timestampSchema } from "./core";

/** Opt-in invoice and cash contracts. Active appContract stays numeric. */
export const exactInvoiceAmountSchema = exactDebtAmountSchema.refine(value => !value.startsWith("-"), "Amount must be nonnegative");
export const exactInvoicePositiveAmountSchema = exactInvoiceAmountSchema.refine(value => value !== "0.00", "Amount must be positive");
export const exactInvoiceLineSourceSchema = z.unknown().transform((value, ctx) => {
  try {
    const line = parseExactLine(value);
    const source = line.source;
    const quantity = Quantity.parse(source.quantity).toWire();
    if (quantity === "0" || quantity.startsWith("-")) throw new Error("Quantity must be positive");
    if ((source.mode === "unit-price" ? source.price : source.total).startsWith("-")) throw new Error("Price must be nonnegative");
    return line.toJSON();
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter positive exact quantity and nonnegative price4 or agreed total2 source operands." });
    return z.NEVER;
  }
});
const command = { requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), currency: z.literal("DZD").default("DZD") };
const nullableText = (length: number) => z.string().trim().max(length).nullable();
const party = { counterpartyType: counterpartyTypeSchema, counterpartyId: entityIdSchema };
const lineInput = z.object({ description: z.string().trim().min(1).max(300), source: exactInvoiceLineSourceSchema }).strict();
const metadata = {
  invoiceNumber: nullableText(100).optional(), supplierName: z.string().trim().min(1).max(200),
  supplierPhone: nullableText(20).optional(), warehouseId: entityIdSchema.nullable().optional(), projectId: entityIdSchema.nullable().optional(),
  invoiceDate: timestampSchema.nullable().optional(), dueDate: timestampSchema.nullable().optional(), notes: nullableText(2000).optional(),
};
export const exactInvoiceCreateSchema = z.object({
  ...command, ...party, ...metadata, id: entityIdSchema.optional(), direction: invoiceDirectionSchema.default("PURCHASE"),
  lineItems: z.array(lineInput).min(1).max(50),
}).strict().superRefine((input, ctx) => {
  if (input.counterpartyType === "WORKER" && input.direction === "SALE") ctx.addIssue({ code: "custom", message: "Workers cannot own sale invoices", path: ["direction"] });
});
export const exactInvoiceUpdateSchema = z.object({
  ...command, id: entityIdSchema,
  invoiceNumber: metadata.invoiceNumber, supplierName: metadata.supplierName.optional(), supplierPhone: metadata.supplierPhone,
  warehouseId: metadata.warehouseId, projectId: metadata.projectId, invoiceDate: metadata.invoiceDate, dueDate: metadata.dueDate,
  notes: metadata.notes, lineItems: z.array(lineInput).min(1).max(50).optional(),
}).strict();
export const exactInvoiceCommandSchema = z.object({ ...command, id: entityIdSchema }).strict();
export const exactInvoiceVoidSchema = exactInvoiceCommandSchema.extend({ reason: z.string().trim().min(1).max(1000) });
export const exactInvoiceSchema = z.object({
  ...party, id: entityIdSchema, invoiceNumber: nullableText(100), supplierName: metadata.supplierName, supplierPhone: nullableText(20),
  warehouseId: entityIdSchema.nullable(), projectId: entityIdSchema.nullable(), invoiceDate: timestampSchema.nullable(), dueDate: timestampSchema.nullable(),
  notes: nullableText(2000), currency: z.literal("DZD"), direction: invoiceDirectionSchema,
  status: z.enum(["DRAFT", "RECEIVED", "PAID", "VOIDED"]),
  totalAmount: exactInvoiceAmountSchema, paidAmount: exactInvoiceAmountSchema, remainingAmount: exactInvoiceAmountSchema,
  debtAccountId: entityIdSchema.nullable(), debtEntryId: entityIdSchema.nullable(),
  createdAt: timestampSchema, updatedAt: timestampSchema,
  lineItems: z.array(lineInput.extend({ id: entityIdSchema, invoiceId: entityIdSchema })).min(1).max(50),
});
const allocationInput = z.object({ invoiceId: entityIdSchema, amount: exactInvoicePositiveAmountSchema }).strict();
export const exactPaymentCreateSchema = z.object({
  ...command, ...party, id: entityIdSchema.optional(), direction: invoiceDirectionSchema,
  paymentDate: timestampSchema, paymentMethod: paymentMethodSchema, totalAmount: exactInvoicePositiveAmountSchema,
  notes: nullableText(2000).optional(), allocations: z.array(allocationInput).max(1000),
}).strict();
export const exactPaymentAllocateSchema = z.object({ ...command, id: entityIdSchema, allocations: z.array(allocationInput).min(1).max(1000) }).strict();
export const exactPaymentSchema = z.object({
  ...party, id: entityIdSchema, currency: z.literal("DZD"), direction: invoiceDirectionSchema,
  paymentDate: timestampSchema, paymentMethod: paymentMethodSchema, totalAmount: exactInvoicePositiveAmountSchema,
  unallocatedAmount: exactInvoiceAmountSchema, status: z.enum(["LIVE", "VOIDED"]), notes: nullableText(2000),
  actorUserId: z.string().nullable(), actorLabel: z.string().nullable(), transactionId: z.string().nullable(),
  createdAt: timestampSchema, updatedAt: timestampSchema,
  allocations: z.array(z.object({ id: entityIdSchema, paymentId: entityIdSchema, invoiceId: entityIdSchema, amount: exactInvoicePositiveAmountSchema,
    debtEntryId: entityIdSchema, status: z.enum(["LIVE", "VOIDED"]), createdAt: timestampSchema })),
});
export const exactInvoiceListSchema = z.object({
  sort: z.object({ field: z.enum(["createdAt", "invoiceDate", "totalAmount"]), direction: z.enum(["asc", "desc"]) }).optional(),
  cursor: z.string().max(2048).optional(), limit: z.number().int().min(1).max(100).default(50),
  filters: z.object({ status: exactInvoiceSchema.shape.status.optional(), counterpartyId: entityIdSchema.optional() }).optional(),
});
export const exactPaymentListSchema = z.object({
  sort: z.object({ field: z.enum(["createdAt", "paymentDate", "totalAmount"]), direction: z.enum(["asc", "desc"]) }).optional(),
  cursor: z.string().max(2048).optional(), limit: z.number().int().min(1).max(100).default(50),
  filters: z.object({ counterpartyId: entityIdSchema.optional(), direction: invoiceDirectionSchema.optional() }).optional(),
});
export const exactInvoiceEqualSplitSchema = z.object({ ...command, amount: exactInvoicePositiveAmountSchema, invoiceIds: z.array(entityIdSchema).min(1).max(1000) }).strict();
export type ExactInvoice = z.infer<typeof exactInvoiceSchema>;
export type ExactPayment = z.infer<typeof exactPaymentSchema>;
export type ExactInvoiceCreate = z.input<typeof exactInvoiceCreateSchema>;
export type ExactInvoiceUpdate = z.input<typeof exactInvoiceUpdateSchema>;
export type ExactInvoiceCommand = z.input<typeof exactInvoiceCommandSchema>;
export type ExactInvoiceVoid = z.input<typeof exactInvoiceVoidSchema>;
export type ExactPaymentCreate = z.input<typeof exactPaymentCreateSchema>;
export type ExactPaymentAllocate = z.input<typeof exactPaymentAllocateSchema>;
export type ExactInvoiceList = z.input<typeof exactInvoiceListSchema>;
export type ExactPaymentList = z.input<typeof exactPaymentListSchema>;

