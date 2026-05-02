import { z } from "zod";

import {
  auditActorUserIdSchema,
  auditTransactionIdSchema,
  entityIdSchema,
  nullableTextSchema,
  timestampSchema,
  warehouseStatusSchema,
} from "./core";

export const warehouseSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160),
  address: nullableTextSchema,
  managerId: entityIdSchema.nullable(),
  status: warehouseStatusSchema,
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const warehouseManagerOwnershipHistorySchema = z.object({
  id: entityIdSchema,
  warehouseId: entityIdSchema,
  managerId: entityIdSchema,
  status: z.string(),
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const warehouseCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: warehouseStatusSchema.default("ACTIVE"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const warehouseUpdateInputSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: warehouseStatusSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const warehouseListInputSchema = z
  .object({
    managerId: entityIdSchema.optional(),
    status: warehouseStatusSchema.optional(),
  })
  .optional();

export const warehouseManagerOwnershipHistoryListInputSchema = z
  .object({ managerId: entityIdSchema.optional(), warehouseId: entityIdSchema.optional() })
  .optional();

export type Warehouse = z.infer<typeof warehouseSchema>;
export type WarehouseManagerOwnershipHistory = z.infer<typeof warehouseManagerOwnershipHistorySchema>;
export type WarehouseCreateInput = z.infer<typeof warehouseCreateInputSchema>;
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateInputSchema>;
