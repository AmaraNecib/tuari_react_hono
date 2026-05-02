import { oc } from "@orpc/contract"

import { createEntityResultSchema } from "./core"
import { authBootstrapInputSchema, authSetupStatusSchema, sessionSchema, sessionUserSchema } from "./auth"

export const authContract = {
  session: oc.output(sessionSchema),
  authSetupStatus: oc.output(authSetupStatusSchema),
  authBootstrap: oc
    .input(authBootstrapInputSchema)
    .output(createEntityResultSchema(sessionUserSchema)),
} as const

export type AuthContract = typeof authContract
