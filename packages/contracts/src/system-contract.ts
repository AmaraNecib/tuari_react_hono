import { oc } from "@orpc/contract"

import { createListSchema } from "./core"
import { systemLogEntrySchema, systemLogListInputSchema } from "./system-log"

export const systemContract = {
  systemLogList: oc
    .input(systemLogListInputSchema)
    .output(createListSchema(systemLogEntrySchema)),
} as const

export type SystemContract = typeof systemContract
