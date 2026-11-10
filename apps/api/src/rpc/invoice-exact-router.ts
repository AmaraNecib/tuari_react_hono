import { implement, ORPCError } from "@orpc/server";
import { z, ZodError } from "zod";
import {
  exactInvoicesContract, exactInvoiceSchema, exactPaymentSchema,
  type ExactInvoiceCreate, type ExactInvoiceUpdate, type ExactInvoiceCommand, type ExactInvoiceVoid,
  type ExactPaymentCreate, type ExactPaymentAllocate,
} from "@tuari/contracts";
import { FifoLockBusyError } from "../infrastructure/database/fifo-lock";
import { ExactDebtError } from "../modules/company/exact-finance.service";
import type { ExactInvoiceService } from "../modules/invoice/invoice-exact.service";
import type { RpcContext } from "./context";
import type { RpcMiddleware, MutationAuditContext } from "./rpc-middleware";

function resolveError(error: unknown): unknown {
  if (error instanceof ExactDebtError) return new ORPCError(error.code, { message: error.message });
  if (error instanceof ZodError || error instanceof RangeError) return new ORPCError("BAD_REQUEST", { message: "Invalid exact invoice or payment input" });
  if (error instanceof FifoLockBusyError || (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_BUSY"))) return new ORPCError("CONFLICT", { message: "Financial transaction is busy. Retry the same request." });
  return error;
}

/** Inject into a separate exact application only. The active router never imports this module. */
export function createExactInvoicesRouter(service: ExactInvoiceService, middleware: RpcMiddleware) {
  const os = implement(exactInvoicesContract).$context<RpcContext>();
  function audited<Input, Output>(schema: z.ZodType<Output>, action: (input: Input, audit: MutationAuditContext) => Output) {
    const handler = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: Input; auditContext: MutationAuditContext }) => action(input, auditContext), resolveError);
    return async (params: { context: RpcContext; input: Input }) => schema.parse(await handler(params));
  }
  const removed = z.object({ id: z.string() });
  return os.router({
    getInvoice: os.getInvoice.handler(middleware.queryAuth(async ({ input }) => service.getInvoice(input.id), resolveError)),
    listInvoices: os.listInvoices.handler(middleware.queryAuth(async ({ input }) => service.listInvoices(input), resolveError)),
    getPayment: os.getPayment.handler(middleware.queryAuth(async ({ input }) => service.getPayment(input.id), resolveError)),
    listPayments: os.listPayments.handler(middleware.queryAuth(async ({ input }) => service.listPayments(input), resolveError)),
    splitPayment: os.splitPayment.handler(middleware.queryAuth(async ({ input }) => service.splitPayment(input.amount, input.invoiceIds), resolveError)),
    createInvoice: os.createInvoice.handler(audited(exactInvoiceSchema, (input: ExactInvoiceCreate, audit) => service.createInvoice({ ...input, ...audit }))),
    updateInvoice: os.updateInvoice.handler(audited(exactInvoiceSchema, (input: ExactInvoiceUpdate, audit) => service.updateInvoice({ ...input, ...audit }))),
    receiveInvoice: os.receiveInvoice.handler(audited(exactInvoiceSchema, (input: ExactInvoiceCommand, audit) => service.receiveInvoice({ ...input, ...audit }))),
    voidInvoice: os.voidInvoice.handler(audited(exactInvoiceSchema, (input: ExactInvoiceVoid, audit) => service.voidInvoice({ ...input, ...audit }))),
    deleteDraft: os.deleteDraft.handler(audited(removed, (input: ExactInvoiceCommand, audit) => service.deleteDraft({ ...input, ...audit }))),
    createPayment: os.createPayment.handler(audited(exactPaymentSchema, (input: ExactPaymentCreate, audit) => service.createPayment({ ...input, ...audit }))),
    allocatePayment: os.allocatePayment.handler(audited(exactPaymentSchema, (input: ExactPaymentAllocate, audit) => service.allocatePayment({ ...input, ...audit }))),
    voidPayment: os.voidPayment.handler(audited(exactPaymentSchema, (input: ExactInvoiceVoid, audit) => service.voidPayment({ ...input, ...audit }))),
    deleteUnallocatedPayment: os.deleteUnallocatedPayment.handler(audited(removed, (input: ExactInvoiceCommand, audit) => service.deleteUnallocatedPayment({ ...input, ...audit }))),
  });
}
