import { implement, ORPCError } from "@orpc/server";
import { z, ZodError } from "zod";
import { employeePayrollOutputSchema, payrollCashRecordSchema, payrollContract, payrollOffsetRecordSchema, payrollRepaymentRecordSchema } from "@tuari/contracts";
import type { EmployeePayrollAdvanceOffsetInput, EmployeePayrollAdvanceRepayInput, EmployeePayrollCashRecordInput } from "@tuari/contracts";
import { FifoLockBusyError } from "../infrastructure/database/fifo-lock";
import { ExactDebtError } from "../modules/company/exact-finance.service";
import { PayrollDomainError } from "../modules/workforce/payroll.service";
import type { PayrollService } from "../modules/workforce/payroll.service";
import type { PayrollLifecycle } from "../modules/workforce/payroll-lifecycle";
import type { RpcContext } from "./context";
import type { RpcMiddleware, MutationAuditContext } from "./rpc-middleware";

function resolveError(error: unknown): unknown {
  if (error instanceof PayrollDomainError) return new ORPCError(error.code, { message: error.message });
  if (error instanceof ExactDebtError) {
    const message = error.code === "NOT_FOUND" ? "Payroll source was not found."
      : error.code === "CONFLICT" ? "Payroll request conflicts with the current balance or request history."
      : "Payroll request is invalid.";
    return new ORPCError(error.code, { message });
  }
  if (error instanceof ZodError) return new ORPCError("BAD_REQUEST", { message: "Invalid payroll input" });
  if (error instanceof FifoLockBusyError || (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_BUSY"))) return new ORPCError("CONFLICT", { message: "Payroll is busy. Retry the same request." });
  return new ORPCError("INTERNAL_SERVER_ERROR", { message: "Payroll operation failed.", cause: error });
}

function parseOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (cause) { throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Payroll operation failed.", cause }); }
}

/** Authenticated exact payroll procedures. Finance remains the only balance and replay authority. */
export function createPayrollRouter(payroll: PayrollService, getPayroll: (employeeId: string) => PayrollLifecycle, middleware: RpcMiddleware) {
  const os = implement(payrollContract).$context<RpcContext>();
  function audited<Input, Output>(schema: z.ZodType<Output>, action: (input: Input, audit: MutationAuditContext) => unknown) {
    const handler = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: Input; auditContext: MutationAuditContext }) => action(input, auditContext), resolveError);
    return async (params: { context: RpcContext; input: Input }) => parseOutput(schema, await handler(params));
  }
  return os.router({
    employeePayrollGet: os.employeePayrollGet.handler(async ({ context, input }) => {
      const handler = middleware.queryAuth<{ employeeId: string }, PayrollLifecycle>(async ({ input: query }) => getPayroll(query.employeeId), resolveError);
      return parseOutput(employeePayrollOutputSchema, await handler({ context, input }));
    }),
    employeePayrollCashRecord: os.employeePayrollCashRecord.handler(audited<EmployeePayrollCashRecordInput, z.infer<typeof payrollCashRecordSchema>>(payrollCashRecordSchema, (input, audit) => payroll.recordCash({ ...input, ...audit }))),
    employeePayrollAdvanceRepay: os.employeePayrollAdvanceRepay.handler(audited<EmployeePayrollAdvanceRepayInput, z.infer<typeof payrollRepaymentRecordSchema>>(payrollRepaymentRecordSchema, (input, audit) => payroll.repayAdvance({ ...input, ...audit }))),
    employeePayrollAdvanceOffset: os.employeePayrollAdvanceOffset.handler(audited<EmployeePayrollAdvanceOffsetInput, z.infer<typeof payrollOffsetRecordSchema>>(payrollOffsetRecordSchema, (input, audit) => payroll.offsetAdvance({ ...input, ...audit }))),
  });
}
