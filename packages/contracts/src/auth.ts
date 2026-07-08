import { z } from "zod";

import { algerianPhoneSchema, entityIdSchema } from "./core";

export const phonePasswordSignInSchema = z.object({
  phone: algerianPhoneSchema,
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional(),
});

export const authBootstrapInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: algerianPhoneSchema,
  password: z.string().min(8).max(128),
  setupSecret: z.string().trim().min(1).max(256).optional(),
});

export const sessionUserSchema = z.object({
  id: entityIdSchema,
  name: z.string().min(1).nullable(),
  phone: z.string().min(1),
  version: z.string().min(1),
});

export const sessionSchema = z.object({
  user: sessionUserSchema.nullable(),
});

export const authSetupStatusSchema = z.object({
  hasUsers: z.boolean(),
  requiresSetupKey: z.boolean(),
});

export type PhonePasswordSignInInput = z.infer<typeof phonePasswordSignInSchema>;
export type AuthBootstrapInput = z.infer<typeof authBootstrapInputSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
