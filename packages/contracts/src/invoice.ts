import { z } from "zod";

// --- Invoice line item ---
export const invoiceLineItemSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPriceDzd: z.number().min(0),
  totalDzd: z.number().min(0),
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
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  totalAmountDzd: z.number().min(0),
  paidAmountDzd: z.number().min(0),
  remainingAmountDzd: z.number().min(0),
  notes: z.string().max(2000).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lineItems: z.array(invoiceLineItemSchema),
});

// --- Input schemas ---
export const invoiceLineItemInputSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPriceDzd: z.number().min(0),
});

export const invoiceCreateInputSchema = z.object({
  invoiceNumber: z.string().max(100).nullable().optional(),
  supplierName: z.string().min(1).max(200),
  supplierPhone: z.string().max(20).nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
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
});

// --- Paginated list input ---
import { cursorPaginationInputSchema } from "./core";

export const invoiceListInputSchema = cursorPaginationInputSchema.extend({
  filters: invoiceListFiltersSchema.optional(),
});

// --- Types ---
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateInputSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateInputSchema>;
export type InvoiceListInput = z.infer<typeof invoiceListInputSchema>;
export type InvoiceMarkPaidInput = z.infer<typeof invoiceMarkPaidInputSchema>;
