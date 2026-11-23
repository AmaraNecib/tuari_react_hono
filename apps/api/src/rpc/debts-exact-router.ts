import { implement, ORPCError } from "@orpc/server";
import { z, ZodError } from "zod";
import {
  exactDebtsContract, exactDebtAccountSchema, exactDebtEntrySchema,
  type CreateExactDebtAccount, type PostExactDebtEntry, type PayExactDebtEntry,
  type CorrectExactDebtEntry, type VoidExactDebtEntry, type SettleExactDebtAccount,
} from "@tuari/contracts";
import { FifoLockBusyError } from "../infrastructure/database/fifo-lock";
import { ExactDebtError, type ExactFinanceService } from "../modules/company/exact-finance.service";
import type { RpcContext } from "./context";
import type { RpcMiddleware, MutationAuditContext } from "./rpc-middleware";

function resolveError(error: unknown): unknown {
  if (error instanceof ExactDebtError) return new ORPCError(error.code, { message: error.message });
  if (error instanceof ZodError) return new ORPCError("BAD_REQUEST", { message: "Invalid exact debt input" });
  if (error instanceof FifoLockBusyError || (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_BUSY"))) {
    return new ORPCError("CONFLICT", { message: "Ledger is busy. Retry the same request." });
  }
  return error;
}

/** Explicit proof/copy injection only. Production router and dependencies never import this module. */
export function createExactDebtsRouter(service: ExactFinanceService, middleware: RpcMiddleware) {
  const os = implement(exactDebtsContract).$context<RpcContext>();
  // The existing admin/audit wrapper returns unknown because legacy handlers
  // may return failure envelopes. Exact handlers throw mapped errors instead.
  function audited<Input, Output>(schema: z.ZodType<Output>, action: (input: Input, audit: MutationAuditContext) => Output) {
    const handler = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: Input; auditContext: MutationAuditContext }) => action(input, auditContext), resolveError);
    return async (params: { context: RpcContext; input: Input }) => schema.parse(await handler(params));
  }
  return os.router({
    summary: os.summary.handler(middleware.queryAuth(async () => service.summary(), resolveError)),
    detail: os.detail.handler(middleware.queryAuth(async ({ input }: { context: RpcContext; input: { id: string } }) => service.detail(input.id), resolveError)),
    create: os.create.handler(audited(exactDebtAccountSchema, (input: CreateExactDebtAccount, audit) => service.createAccount({ ...input, ...audit }))),
    post: os.post.handler(audited(exactDebtEntrySchema, (input: PostExactDebtEntry, audit) => service.postEntry({ ...input, ...audit }))),
    pay: os.pay.handler(audited(exactDebtEntrySchema, (input: PayExactDebtEntry, audit) => service.recordPayment({ ...input, ...audit }))),
    correct: os.correct.handler(audited(exactDebtEntrySchema, (input: CorrectExactDebtEntry, audit) => service.correctEntry({ ...input, ...audit }))),
    void: os.void.handler(audited(exactDebtEntrySchema, (input: VoidExactDebtEntry, audit) => service.voidEntry({ ...input, ...audit }))),
    settle: os.settle.handler(audited(z.array(exactDebtEntrySchema), (input: SettleExactDebtAccount, audit) => service.settleAccount({ ...input, ...audit }))),
  });
}
