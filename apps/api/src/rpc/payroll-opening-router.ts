import { implement, ORPCError } from "@orpc/server";
import { payrollOpeningContract, payrollOpeningOutputSchema, type payrollOpeningReviewInputSchema, type payrollOpeningCorrectInputSchema } from "@tuari/contracts";
import type { z } from "zod";
import type { PayrollOpeningService } from "../modules/workforce/payroll-opening.service";
import type { RpcContext } from "./context";
import type { MutationAuditContext, RpcMiddleware } from "./rpc-middleware";

export function createPayrollOpeningRouter(opening: PayrollOpeningService | undefined, middleware: RpcMiddleware, resolveError: (error: unknown) => unknown) {
  const os = implement(payrollOpeningContract).$context<RpcContext>();
  const service = () => {
    if (!opening) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Opening review is not configured" });
    return opening;
  };
  function write<Input extends { employeeId: string }>(action: (input: Input, audit: MutationAuditContext) => void) {
    const handler = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: Input; auditContext: MutationAuditContext }) => {
      action(input, auditContext);
      return service().get(input.employeeId);
    }, resolveError);
    return async (params: { context: RpcContext; input: Input }) => payrollOpeningOutputSchema.parse(await handler(params));
  }
  return os.router({
    employeePayrollOpeningGet: os.employeePayrollOpeningGet.handler(async params => {
      const handler = middleware.queryAuth<{ employeeId: string }, ReturnType<PayrollOpeningService["get"]>>(async ({ input }) => service().get(input.employeeId), resolveError);
      return payrollOpeningOutputSchema.parse(await handler(params));
    }),
    employeePayrollOpeningReview: os.employeePayrollOpeningReview.handler(write<z.input<typeof payrollOpeningReviewInputSchema>>((input, audit) => { service().review({ ...input, ...audit }); })),
    employeePayrollOpeningCorrect: os.employeePayrollOpeningCorrect.handler(write<z.input<typeof payrollOpeningCorrectInputSchema>>((input, audit) => { service().correct({ ...input, ...audit }); })),
  });
}
