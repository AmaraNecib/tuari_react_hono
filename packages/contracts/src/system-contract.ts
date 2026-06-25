import { oc } from "@orpc/contract"
import { z } from "zod"

import { createListSchema } from "./core"
import { systemLogEntrySchema, systemLogListInputSchema } from "./system-log"
import {
  recoveryKeyPoolStatusSchema,
  generatedRecoveryKeysSchema,
  consumeRecoveryKeyInputSchema,
  revokeRecoveryKeyInputSchema,
  changeDbKeyInputSchema,
} from "./security"

export const systemContract = {
  systemLogList: oc
    .input(systemLogListInputSchema)
    .output(createListSchema(systemLogEntrySchema)),

  // Recovery key management
  getRecoveryKeyPool: oc.output(recoveryKeyPoolStatusSchema),
  generateRecoveryKeys: oc.output(generatedRecoveryKeysSchema),
  consumeRecoveryKey: oc
    .input(consumeRecoveryKeyInputSchema)
    .output(z.object({ success: z.boolean() })),
  revokeRecoveryKey: oc
    .input(revokeRecoveryKeyInputSchema)
    .output(z.object({ success: z.boolean() })),
  changeDbEncryptionKey: oc
    .input(changeDbKeyInputSchema)
    .output(z.object({ success: z.boolean() })),
} as const

export type SystemContract = typeof systemContract
