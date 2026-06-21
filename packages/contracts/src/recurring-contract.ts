import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  recurringPatternListSchema,
  recurringPatternSchema,
} from "./recurring";
import { idInputSchema } from "./core";

const emptyInputSchema = z.object({}).strict();

export const recurringPatternsContract = {
  recurringPatternsList: oc
    .input(emptyInputSchema)
    .output(recurringPatternListSchema),

  recurringPatternsGet: oc
    .input(idInputSchema)
    .output(recurringPatternSchema),
} as const;
