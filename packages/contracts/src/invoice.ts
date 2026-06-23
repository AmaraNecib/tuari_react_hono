import { z } from "zod";

// Supported invoice currencies. Today only DZD is wired end-to-end;
// the schema and types are forward-compatible so adding EUR/USD later
// is a config change, not a refactor.
export const invoiceCurrencySchema = z.enum(["DZD"]);
export type InvoiceCurrency = z.infer<typeof invoiceCurrencySchema>;

// Invoice direction. PURCHASE means we owe the supplier (default);
// SALE means the counterparty owes us (receivable direction on the
// linked debt account). Workers cannot have SALE — they don't sell
// to the company.
export const invoiceDirectionSchema = z.enum(["PURCHASE", "SALE"]);
export type InvoiceDirection = z.infer<typeof invoiceDirectionSchema>;

// --- Invoice line item ---
export const invoiceLineItemSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
});

// --- Invoice ---
export const invoiceStatusSchema = z.enum(["DRAFT", "RECEIVED", "PAID"]);

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().max(100).nullable(),
  supplierName: z.string().min(1).max(200),
  supplierPhone: z.string().max(20).nullable(),
  warehouseId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  status: invoiceStatusSchema,
  direction: invoiceDirectionSchema,
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  currency: invoiceCurrencySchema,
  totalAmount: z.number().min(0),
  paidAmount: z.number().min(0),
  remainingAmount: z.number().min(0),
  notes: z.string().max(2000).nullable(),
  debtAccountId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lineItems: z.array(invoiceLineItemSchema),
});

// --- Input schemas ---
export const invoiceLineItemInputSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

export const invoiceCreateInputSchema = z.object({
  invoiceNumber: z.string().max(100).nullable().optional(),
  supplierName: z.string().min(1).max(200),
  supplierPhone: z.string().max(20).nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  direction: invoiceDirectionSchema.optional().default("PURCHASE"),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  currency: invoiceCurrencySchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  lineItems: z.array(invoiceLineItemInputSchema).min(1).max(50),
});

export const invoiceUpdateInputSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().max(100).nullable().optional(),
  supplierName: z.string().min(1).max(200).optional(),
  supplierPhone: z.string().max(20).nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  currency: invoiceCurrencySchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  lineItems: z.array(invoiceLineItemInputSchema).min(1).max(50).optional(),
});

export const invoiceListFiltersSchema = z.object({
  status: invoiceStatusSchema.optional(),
  supplierName: z.string().max(200).optional(),
  warehouseId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export const invoiceMarkPaidInputSchema = z.object({
  id: z.string().uuid(),
  amountDzd: z.number().positive(),
  direction: invoiceDirectionSchema.optional(),
});

// --- Paginated list input ---
import { cursorPaginationInputSchema } from "./core";

export const invoiceListSortFieldSchema = z.enum([
  "createdAt",
  "invoiceDate",
  "totalAmount",
]);
export const sortDirectionSchema = z.enum(["asc", "desc"]);

export const invoiceListInputSchema = cursorPaginationInputSchema.extend({
  filters: invoiceListFiltersSchema.optional(),
  sort: z
    .object({
      field: invoiceListSortFieldSchema,
      direction: sortDirectionSchema,
    })
    .optional(),
});

export type InvoiceListSortField = z.infer<typeof invoiceListSortFieldSchema>;
export type SortDirection = z.infer<typeof sortDirectionSchema>;
export type InvoiceListInputSort = {
  field: InvoiceListSortField;
  direction: SortDirection;
};

// --- Types ---
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateInputSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateInputSchema>;
export type InvoiceListInput = z.infer<typeof invoiceListInputSchema>;
export type InvoiceMarkPaidInput = z.infer<typeof invoiceMarkPaidInputSchema>;
