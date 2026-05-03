import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";

export const recurringFrequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]);
export type RecurringFrequency = z.infer<typeof recurringFrequencySchema>;

export const recurringAmountTypeSchema = z.enum(["FIXED", "FORMULA"]);
export type RecurringAmountType = z.infer<typeof recurringAmountTypeSchema>;

export const recurringPatternSchema = z.object({
  id: entityIdSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(500).nullable(),
  frequency: recurringFrequencySchema,
  customDays: z.number().nonnegative().optional(),
  amountType: recurringAmountTypeSchema,
  fixedAmountDzd: z.number().nonnegative().optional(),
  formula: z.string().max(255).optional(),
  partyId: entityIdSchema,
  isActive: z.boolean(),
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  nextOccurrenceDate: timestampSchema.nullable(),
  requiresApproval: z.boolean().default(true),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type RecurringPattern = z.infer<typeof recurringPatternSchema>;

export const recurringPatternListSchema = z.object({
  items: z.array(recurringPatternSchema),
});

export const createRecurringPatternSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  frequency: recurringFrequencySchema,
  customDays: z.number().nonnegative().optional(),
  amountType: recurringAmountTypeSchema,
  fixedAmountDzd: z.number().nonnegative().optional(),
  formula: z.string().max(255).optional(),
  partyId: entityIdSchema,
  startDate: timestampSchema,
  endDate: timestampSchema.optional(),
  requiresApproval: z.boolean().default(true),
});

export type CreateRecurringPatternInput = z.infer<typeof createRecurringPatternSchema>;
