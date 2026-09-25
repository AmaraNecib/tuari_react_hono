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
 * Shared key-field schema for exact-match secrets (#234, #334).
 *
 * `trim()` removes only ECMAScript WhiteSpace/LineTerminator — format (Cf)
 * characters such as U+200B ZWSP, U+200E/200F LRM/RLM and U+200C/200D
 * ZWNJ/ZWJ are not WhiteSpace, so they survive trim and `.min()`. (U+FEFF
 * BOM IS WhiteSpace and is trimmed at the edges; a mid-string U+FEFF is
 * still caught by the Cf check below.) These
 * fields are exact-match secrets (recovery keys are SHA-256-hashed, the DB
 * key becomes the PRAGMA rekey value), so a string that CONTAINS a rejected
 * codepoint anywhere is rejected — stricter than the auth.ts name/password
 * checks, which only reject all-invisible strings: a key is either exactly
 * right or wrong, there is no "visible enough".
 *
 * Rejected anywhere (#334, closes the #234 residual class):
 * - `\p{Cf}` format chars (ZWSP, LRM/RLM, ZWNJ/ZWJ, soft hyphen, …) —
 *   invisible, never render.
 * - `\p{Mn}` nonspacing marks (combining accents U+0300-U+036F, variation
 *   selectors, …) — invisible; an embedded mark makes a key LOOK right but
 *   never match.
 * - `\p{Zs}` space separators (space, NBSP, ideographic space, …) — issue
 *   case 4: trim() is edge-only, so a mid-string NBSP survived. A space
 *   renders blank and is indistinguishable from a regular space in a
 *   monospace key field, and no generated key contains one. (The #221 pin
 *   is untouched — its pinned character is LF, a Cc, preserved by the Cc
 *   carve-out below.)
 * - U+2800 BRAILLE BLANK — renders as a blank cell; 8 of them pass
 *   min(8) and would become the PRAGMA rekey value. Only the blank-cell
 *   symbol is targeted — visible So symbols (©, …) stay allowed.
 * - Blank-rendering Lo letters: Hangul fillers U+115F/U+1160/U+3164/U+FFA0
 *   (the enumerable blank cells outside the issue's named classes — same
 *   hazard as U+2800, and U+3164 is a known obfuscation vector).
 * - `\p{Cc}` EXCEPT tab/LF/VT/FF/CR (U+0009-U+000D). Invisible controls
 *   (U+0000-U+0008, U+000E-U+001F, U+007F-U+009F) render as nothing but
 *   `.min()` counts them. Tab/LF/VT/FF/CR are the ECMAScript-whitespace
 *   subset — visible formatting: the #221 pin deliberately accepts an
 *   internal newline in a recovery key (wrapped-across-email-line paste),
 *   and `\r`/`\t` are common paste artifacts. They are still stripped by
 *   trim() at the edges, so an all-whitespace-control key trims to "" and
 *   fails `.min()`.
 *
 * Deliberately ALLOWED: Zl/Zp line/paragraph separators (U+2028/U+2029)
 * — they render as visible line breaks, consistent with the LF carve-out
 * above. Residual (documented): unassigned codepoints / lone surrogates
 * (Cn) still pass — programmatic/corrupt-paste only, no IME input path.
 * Visible symbols (©, emoji, …) and letters (incl. CJK ideographs) pass
 * as intended.
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
    .refine(
      (value) =>
        value.length < min ||
        !/(?:[\p{Cf}\p{Mn}\p{Zs}\u2800\u115F\u1160\u3164\uFFA0]|(?![\x09-\x0D])[\p{Cc}])/u.test(
          value,
        ),
      {
        message: `${label} must not contain blank or invisible characters (e.g. spaces, zero-width space, combining marks, control characters)`,
      },
    )

/** Input for consuming a recovery key. */
export const consumeRecoveryKeyInputSchema = z.object({
  key: keyFieldSchema(1, "recovery key"),
})

/** Input for revoking a recovery key. */
export const revokeRecoveryKeyInputSchema = z.object({
  keyId: keyFieldSchema(1, "recovery key id"),
})

/**
 * Input for changing the database encryption key.
 *
 * `currentKey` is deliberately NOT held to the strict blank/invisible rule
 * above: it names a key that ALREADY exists. A deployment whose DB key
 * predates #334 can legitimately hold an internal space, NBSP, or combining
 * mark — such a key still opens the database at startup (the loader only
 * enforces the new-key length, and the service accepts any non-empty value),
 * so rejecting it here would strand those users with no way to rotate their
 * key through Settings or the RPC. The existing key is proven by re-opening
 * the database with it (SQLCipher probe), which is the correct gate: a wrong
 * key fails verification regardless of its charset.
 *
 * `newKey` keeps the strict rule — it is the value we persist going forward.
 */
export const changeDbKeyInputSchema = z.object({
  currentKey: z
    .string()
    .trim()
    .min(1, { message: "current encryption key must not be empty" }),
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
 * orphan a database that IS on the new key (issue #265).
 *
 * Rekey outcomes are tri-state (issue #265, Greptile P1):
 * - `rekeyed: true` — the database IS on the new key (verified rekey); keep
 *   the new key and clear the rollback slot.
 * - `rekeyed: false` WITHOUT `ambiguous` — the database DEFINITIVELY is NOT
 *   on the new key; restoring the old key is safe.
 * - `rekeyed: false` WITH `ambiguous: true` — the rekey ran but the
 *   post-rekey verification could not complete (transient/system probe
 *   failure). The database is likely on the new key: do NOT restore the old
 *   key and do NOT clear the rollback slot — surface the honest "rekey
 *   applied but verification pending" state instead. `ambiguous` never
 *   combines with `rekeyed: true` (a verified rekey is not ambiguous).
 * Strict members reject the invalid combos.
 */
export const changeDbKeyOutputSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true) }).strict(),
  z
    .object({
      success: z.literal(false),
      error: z.string().min(1),
      rekeyed: z.boolean(),
      ambiguous: z.boolean().optional(),
    })
    // Pure validator (no transform): output schemas reject, they don't
    // silently rewrite server-emitted values. Rejects blank-looking errors.
    .refine(({ error }) => error.trim().length > 0, {
      message: "error must contain non-whitespace characters",
      path: ["error"],
    })
    // A verified rekey is never ambiguous — `ambiguous` only marks a
    // verification that COULD NOT complete (Greptile P1).
    .refine(({ rekeyed, ambiguous }) => !(rekeyed && ambiguous), {
      message: "ambiguous must not combine with rekeyed: true",
      path: ["ambiguous"],
    })
    .strict(),
])

/** Input for changing the app password. */
export const changeAppPasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})
