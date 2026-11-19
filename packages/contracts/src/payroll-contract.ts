import { oc } from "@orpc/contract";
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

export const payrollContract = {
  employeePayrollGet: oc.input(employeePayrollGetInputSchema).output(employeePayrollOutputSchema),
  employeePayrollCashRecord: oc.input(employeePayrollCashRecordInputSchema).output(payrollCashRecordSchema),
  employeePayrollAdvanceRepay: oc.input(employeePayrollAdvanceRepayInputSchema).output(payrollRepaymentRecordSchema),
  employeePayrollAdvanceOffset: oc.input(employeePayrollAdvanceOffsetInputSchema).output(payrollOffsetRecordSchema),
} as const;
