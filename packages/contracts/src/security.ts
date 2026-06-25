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
  availableCount: z.number(),
  totalCount: z.number(),
  maxPoolSize: z.number(),
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

/** Input for consuming a recovery key. */
export const consumeRecoveryKeyInputSchema = z.object({
  key: z.string().min(1),
})

/** Input for revoking a recovery key. */
export const revokeRecoveryKeyInputSchema = z.object({
  keyId: z.string().min(1),
})

/** Input for changing the database encryption key. */
export const changeDbKeyInputSchema = z.object({
  currentKey: z.string().min(1),
  newKey: z.string().min(8),
})

/** Input for changing the app password. */
export const changeAppPasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})
