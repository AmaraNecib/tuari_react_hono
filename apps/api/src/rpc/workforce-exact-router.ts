import { implement, ORPCError } from "@orpc/server";
import { z, ZodError } from "zod";
import { exactWorkforceContract, exactSalaryMonthlyApprovalInputSchema, exactSalaryMonthlyApprovalResultSchema, exactSalaryCashInputSchema, exactSalaryOpeningReviewInputSchema, exactSalaryAdvanceRepaymentInputSchema, exactSalaryCorrectionInputSchema, exactPayrollCashRecordSchema, exactPayrollOpeningRecordSchema, exactPayrollSettlementRecordSchema, exactPayrollCorrectionRecordSchema, exactPayrollLifecycleSchema } from "@tuari/contracts";
import { ExactDebtError } from "../modules/company/exact-finance.service";
import { FifoLockBusyError } from "../infrastructure/database/fifo-lock";
import type { ExactWorkforceService } from "../modules/company/workforce-exact.service";
import type { PayrollCashService } from "../modules/company/payroll-cash.service";
import type { RpcContext } from "./context";
import type { RpcMiddleware, MutationAuditContext } from "./rpc-middleware";

function resolveError(error: unknown): unknown {
  if (error instanceof ExactDebtError) return new ORPCError(error.code, { message: error.message });
  if (error instanceof ZodError || error instanceof RangeError || (error instanceof TypeError && error.message.startsWith("Aggregate "))) return new ORPCError("BAD_REQUEST", { message: "Invalid exact payroll input" });
  if (error instanceof FifoLockBusyError || (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_BUSY"))) return new ORPCError("CONFLICT", { message: "Financial transaction is busy. Retry the same request." });
  return error;
}

/** Injectable exact-copy router only. The active numeric router does not import it. */
export function createExactWorkforceRouter(service: ExactWorkforceService, middleware: RpcMiddleware, payroll: PayrollCashService) {
  const os = implement(exactWorkforceContract).$context<RpcContext>();
  const approve = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: z.output<typeof exactSalaryMonthlyApprovalInputSchema>; auditContext: MutationAuditContext }) => {
      // RPC validation derives fields. The command still accepts only explicit raw inputs.
      const result = service.approveMonthlyEarnings({
        requestId: input.requestId, employeeId: input.employeeId, currency: input.currency,
        months: input.months.map(({ id, month, amount, unallocatedAmount, segments }) => ({ id, month, amount, unallocatedAmount, segments })),
        ...auditContext,
      });
      return result;
    }, resolveError);
  const recordCash = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: z.output<typeof exactSalaryCashInputSchema>; auditContext: MutationAuditContext }) => payroll.recordCash({ ...input, ...auditContext }), resolveError);
  const reviewOpening = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: z.output<typeof exactSalaryOpeningReviewInputSchema>; auditContext: MutationAuditContext }) => payroll.reviewOpening({ ...input, ...auditContext }), resolveError);
  const repayAdvance = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: z.output<typeof exactSalaryAdvanceRepaymentInputSchema>; auditContext: MutationAuditContext }) => payroll.repayAdvance({ ...input, ...auditContext }), resolveError);
  const correctEarning = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: z.output<typeof exactSalaryCorrectionInputSchema>; auditContext: MutationAuditContext }) => payroll.correctEarning({ ...input, ...auditContext }), resolveError);
  return os.router({
    recordPayrollCash: os.recordPayrollCash.handler(async params => exactPayrollCashRecordSchema.parse(await recordCash(params))),
    reviewPayrollOpening: os.reviewPayrollOpening.handler(async params => {
      await reviewOpening(params);
      return exactPayrollOpeningRecordSchema.parse(payroll.listEmployeeLifecycle(params.input.employeeId).opening);
    }),
    repayPayrollAdvance: os.repayPayrollAdvance.handler(async params => exactPayrollSettlementRecordSchema.parse(await repayAdvance(params))),
    correctPayrollEarning: os.correctPayrollEarning.handler(async params => exactPayrollCorrectionRecordSchema.parse(await correctEarning(params))),
    getEmployeePayrollLifecycle: os.getEmployeePayrollLifecycle.handler(middleware.queryAuth(async ({ input }) => {
      const lifecycle = payroll.listEmployeeLifecycle(input.employeeId);
      return exactPayrollLifecycleSchema.parse(lifecycle);
    }, resolveError)),
    approveMonthlyEarnings: os.approveMonthlyEarnings.handler(async params => exactSalaryMonthlyApprovalResultSchema.parse(await approve(params))),
    listEmployeeEarnings: os.listEmployeeEarnings.handler(middleware.queryAuth(async ({ input }) => service.listEmployeeEarnings(input.employeeId), resolveError)),
    getProjectSalaryCost: os.getProjectSalaryCost.handler(middleware.queryAuth(async ({ input }) => service.getProjectSalaryCost(input.projectId), resolveError)),
  });
}
