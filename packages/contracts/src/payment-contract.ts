import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  paymentSchema,
  createPaymentInputSchema,
  paymentListInputSchema,
  paymentListOutputSchema,
} from "./payment";

export const paymentContract = {
  paymentsList: oc
    .input(paymentListInputSchema)
    .output(paymentListOutputSchema),

  paymentsGet: oc
    .input(z.object({ id: z.string().uuid() }))
    .output(paymentSchema),

  paymentsCreate: oc
    .input(createPaymentInputSchema)
    .output(paymentSchema),

  paymentsDelete: oc
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() })),
} as const;
