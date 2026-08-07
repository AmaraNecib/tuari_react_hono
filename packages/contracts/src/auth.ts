import { z } from "zod";

import { algerianPhoneSchema, entityIdSchema } from "./core";

export const phonePasswordSignInSchema = z.object({
  phone: algerianPhoneSchema,
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional(),
});

export const authBootstrapInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    // Reject invisible-only names: trim() keeps format characters (ZWSP,
    // LRM, …) which are not WhiteSpace, so a blank-looking name must not
    // become the stored display name (same hygiene class as #226/#234).
    // The empty-string guard defers to .min(1) so an empty name yields a
    // single "required" issue, not a doubled-up custom issue.
    .refine((value) => value.length === 0 || /[^\p{Cf}]/u.test(value), {
      message: "name must contain at least one visible character",
    }),
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
