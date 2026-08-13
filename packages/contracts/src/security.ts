/**
 * Security settings schemas for recovery key management and password changes.
 */
import { z } from "zod"

/** Recovery key status values. */
export const recoveryKeyStatusSchema = z.enum(["AVAILABLE", "CONSUMED", "REVOKED"])

/** Masked recovery key for display (prefix + status, never plain text). */
export const maskedRecoveryKeySchema = z.object({
  id: z.string(),
  prefix: z.string().length(4),
  status: recoveryKeyStatusSchema,
})

/** Recovery key pool status returned by the Settings UI. */
export const recoveryKeyPoolStatusSchema = z.object({
  availableCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  maxPoolSize: z.number().int().positive(),
  maskedKeys: z.array(maskedRecoveryKeySchema),
})

/** Generated recovery keys (plain text, shown once). */
export const generatedRecoveryKeysSchema = z.object({
  keys: z.array(z.object({
    key: z.string(),
    prefix: z.string().length(4),
    createdAt: z.string(),
  })),
})

/**
 * Shared key-field schema for exact-match secrets (#234).
 *
 * `trim()` removes only ECMAScript WhiteSpace/LineTerminator — format (Cf)
 * characters such as U+200B ZWSP, U+200E/200F LRM/RLM and U+200C/200D
 * ZWNJ/ZWJ are not WhiteSpace, so they survive trim and `.min()`. (U+FEFF
 * BOM IS WhiteSpace and is trimmed at the edges; a mid-string U+FEFF is
 * still caught by the Cf check below.) These
 * fields are exact-match secrets (recovery keys are SHA-256-hashed, the DB
 * key becomes the PRAGMA rekey value), so a string that CONTAINS a Cf
 * codepoint anywhere is rejected — stricter than the auth.ts name/password
 * checks, which only reject all-invisible strings: a key is either exactly
 * right or wrong, there is no "visible enough".
 *
 * Residual class (documented, tracked as #334): invisible codepoints
 * OUTSIDE Cf — e.g. U+2800 braille blank (So), combining marks (Mn), Cc
 * controls, mid-string NBSP (Zs) — still pass. The issue scoped the fix to
 * `\p{Cf}`; widening the class is a separate decision (#334).
 *
 * The length guard defers to `.min(min)` for every too-short value so a
 * short+invisible key (e.g. 3 ZWSP against min(8)) yields a single
 * too_small issue, not doubled too_small + custom issues (same pattern as
 * the auth.ts password/name refines — zod ^4 runs refinements even after a
 * failed check).
 */
const keyFieldSchema = (min: number, label: string) =>
  z
    .string()
    .trim()
    .min(min)
    .refine((value) => value.length < min || !/[\p{Cf}]/u.test(value), {
      message: `${label} must not contain invisible format characters (e.g. zero-width space)`,
    })

/** Input for consuming a recovery key. */
export const consumeRecoveryKeyInputSchema = z.object({
  key: keyFieldSchema(1, "recovery key"),
})

/** Input for revoking a recovery key. */
export const revokeRecoveryKeyInputSchema = z.object({
  keyId: keyFieldSchema(1, "recovery key id"),
})

/** Input for changing the database encryption key. */
export const changeDbKeyInputSchema = z.object({
  currentKey: keyFieldSchema(1, "current encryption key"),
  newKey: keyFieldSchema(8, "new encryption key"),
})

/**
 * Output for DB key change result.
 *
 * Discriminated on `success`: a failure always carries an `error` message and
 * a `rekeyed` flag, and a success never does. `rekeyed` tells the caller
 * whether the database was actually re-encrypted before the failure surfaced
 * (e.g. persistence of the new key failed AFTER a successful rekey) — the
 * caller must roll the keyring back only when `rekeyed` is false, or it would
 * orphan a database that IS on the new key (issue #265). Strict members
 * reject the invalid combos.
 */
export const changeDbKeyOutputSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true) }).strict(),
  z
    .object({
      success: z.literal(false),
      error: z.string().min(1),
      rekeyed: z.boolean(),
    })
    // Pure validator (no transform): output schemas reject, they don't
    // silently rewrite server-emitted values. Rejects blank-looking errors.
    .refine(({ error }) => error.trim().length > 0, {
      message: "error must contain non-whitespace characters",
      path: ["error"],
    })
    .strict(),
])

/** Input for changing the app password. */
export const changeAppPasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})
