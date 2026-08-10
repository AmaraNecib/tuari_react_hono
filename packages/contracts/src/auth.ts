import { z } from "zod";

import { algerianPhoneSchema, entityIdSchema } from "./core";

/**
 * Shared credential password policy (sign-in + bootstrap stay consistent).
 *
 * #230: length bounds alone admit a blank-looking password (8 spaces pass
 * `.min(8)`), which would hash into a usable credential. We deliberately do
 * NOT trim/normalize — passwords are opaque secrets and the stored hash must
 * be computed over exactly what the user typed — so the check is a refine
 * that requires at least one visible character: anything that is not a
 * control (Cc), format (Cf: ZWSP/LRM/BOM), nonspacing mark (Mn: combining
 * accents, variation selectors), or separator (Z) codepoint. Internal spaces
 * remain allowed (NIST 800-63B); only all-invisible values are rejected.
 * The length guard defers to `.min(8)`/`.max(128)` for every out-of-bounds
 * value so a short+blank (e.g. 6 spaces) or over-long+blank (e.g. 129
 * spaces) password yields a single length issue, not doubled
 * too_small/too_big + custom issues (same pattern as the bootstrap name
 * refine).
 */
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine(
    (value) =>
      value.length < 8 || value.length > 128 || /[^\p{Cc}\p{Cf}\p{Mn}\p{Z}]/u.test(value),
    {
      message: "password must contain at least one visible character",
    },
  );

export const phonePasswordSignInSchema = z.object({
  phone: algerianPhoneSchema,
  password: passwordSchema,
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
  password: passwordSchema,
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
