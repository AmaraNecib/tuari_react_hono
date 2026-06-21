import { oc } from "@orpc/contract";
import {
  recurringPatternListSchema,
  recurringPatternSchema,
} from "./recurring";
import { idInputSchema } from "./core";

export const recurringPatternsContract = {
  recurringPatternsList: oc
    .input({})
    .output(recurringPatternListSchema),

  recurringPatternsGet: oc
    .input(idInputSchema)
    .output(recurringPatternSchema),
} as const;
