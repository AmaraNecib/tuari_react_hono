import { z } from "zod";

import {
  auditActorUserIdSchema,
  auditTransactionIdSchema,
  entityIdSchema,
  nullableTextSchema,
  projectStatusSchema,
  timestampSchema,
} from "./core";

export const projectSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160),
  location: nullableTextSchema,
  managerId: entityIdSchema.nullable(),
  status: projectStatusSchema,
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const projectManagerOwnershipHistorySchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
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

export const projectCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  location: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: projectStatusSchema.default("ACTIVE"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const projectUpdateInputSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
  location: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: projectStatusSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const projectListInputSchema = z
  .object({
    managerId: entityIdSchema.optional(),
    status: projectStatusSchema.optional(),
  })
  .optional();

export const projectManagerOwnershipHistoryListInputSchema = z
  .object({ managerId: entityIdSchema.optional(), projectId: entityIdSchema.optional() })
  .optional();

export type Project = z.infer<typeof projectSchema>;
export type ProjectManagerOwnershipHistory = z.infer<typeof projectManagerOwnershipHistorySchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;
