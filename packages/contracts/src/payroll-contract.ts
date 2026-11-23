import { oc } from "@orpc/contract";
import { z } from "zod";

const payrollWrite = oc.errors({
  BAD_REQUEST: { data: z.object({ payrollOutcome: z.literal("NOT_COMMITTED") }).optional() },
  NOT_FOUND: { data: z.object({ payrollOutcome: z.literal("NOT_COMMITTED") }).optional() },
  CONFLICT: { data: z.object({ payrollOutcome: z.literal("NOT_COMMITTED") }).optional() },
});
import {
  employeePayrollAdvanceOffsetInputSchema,
  employeePayrollAdvanceRepayInputSchema,
  employeePayrollCashRecordInputSchema,
  employeePayrollGetInputSchema,
  employeePayrollOutputSchema,
  payrollCashRecordSchema,
  payrollOffsetRecordSchema,
  payrollRepaymentRecordSchema,
} from "./payroll";

import { payrollOpeningContract } from "./payroll-opening";

export const payrollContract = {
  ...payrollOpeningContract,
  employeePayrollGet: oc.input(employeePayrollGetInputSchema).output(employeePayrollOutputSchema),
  employeePayrollCashRecord: payrollWrite.input(employeePayrollCashRecordInputSchema).output(payrollCashRecordSchema),
  employeePayrollAdvanceRepay: payrollWrite.input(employeePayrollAdvanceRepayInputSchema).output(payrollRepaymentRecordSchema),
  employeePayrollAdvanceOffset: payrollWrite.input(employeePayrollAdvanceOffsetInputSchema).output(payrollOffsetRecordSchema),
} as const;
