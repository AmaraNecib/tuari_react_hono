import { implement, ORPCError } from "@orpc/server";
import { z, ZodError } from "zod";
import {
  experimentalExactInvoicesContract, experimentalExactInvoiceSchema, exactPaymentSchema,
  type ExactInvoiceCreate, type ExactInvoiceUpdate, type ExactInvoiceCommand, type ExactInvoiceVoid,
  type ExactPaymentCreate, type ExactPaymentAllocate,
} from "@tuari/contracts";
import { FifoLockBusyError } from "../infrastructure/database/fifo-lock";
import { ExactDebtError } from "../modules/company/exact-finance.service";
import type { ExperimentalExactInvoiceService } from "../modules/invoice/experimental-invoice.service";
import type { RpcContext } from "./context";
import type { RpcMiddleware, MutationAuditContext } from "./rpc-middleware";

function resolveError(error: unknown): unknown {
  if (error instanceof ExactDebtError) return new ORPCError(error.code, { message: error.message });
  if (error instanceof ZodError || error instanceof RangeError) return new ORPCError("BAD_REQUEST", { message: "Invalid experimental invoice or payment input" });
  if (error instanceof FifoLockBusyError || (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_BUSY"))) return new ORPCError("CONFLICT", { message: "Financial transaction is busy. Retry the same request." });
  return error;
}
const unavailable = (): never => { throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Experimental invoice settlement composition is not configured" }); };

/** Owner/admin-protected invoice RPCs. An absent capability always fails closed. */
export function createExperimentalExactInvoicesRouter(service: ExperimentalExactInvoiceService | undefined, middleware: RpcMiddleware) {
  const os = implement(experimentalExactInvoicesContract).$context<RpcContext>();
  function audited<Input, Output>(schema: z.ZodType<Output>, action: (input: Input, audit: MutationAuditContext) => Output) {
    const handler = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: Input; auditContext: MutationAuditContext }) => action(input, auditContext), resolveError);
    return async (params: { context: RpcContext; input: Input }) => schema.parse(await handler(params));
  }
  const removed = z.object({ id: z.string() });
  return os.router({
    getInvoice: os.getInvoice.handler(middleware.queryAuth(async ({ input }) => service ? service.getInvoice(input.id) : unavailable(), resolveError)),
    listInvoices: os.listInvoices.handler(middleware.queryAuth(async ({ input }) => service ? service.listInvoices(input) : unavailable(), resolveError)),
    getPayment: os.getPayment.handler(middleware.queryAuth(async ({ input }) => service ? service.getPayment(input.id) : unavailable(), resolveError)),
    listPayments: os.listPayments.handler(middleware.queryAuth(async ({ input }) => service ? service.listPayments(input) : unavailable(), resolveError)),
    splitPayment: os.splitPayment.handler(middleware.queryAuth(async ({ input }) => service ? service.splitPayment(input.amount, input.invoiceIds) : unavailable(), resolveError)),
    createInvoice: os.createInvoice.handler(audited(experimentalExactInvoiceSchema, (input: ExactInvoiceCreate, audit) => service ? service.createInvoice({ ...input, ...audit }) : unavailable())),
    updateInvoice: os.updateInvoice.handler(audited(experimentalExactInvoiceSchema, (input: ExactInvoiceUpdate, audit) => service ? service.updateInvoice({ ...input, ...audit }) : unavailable())),
    receiveInvoice: os.receiveInvoice.handler(audited(experimentalExactInvoiceSchema, (input: ExactInvoiceCommand, audit) => service ? service.receiveInvoice({ ...input, ...audit }) : unavailable())),
    voidInvoice: os.voidInvoice.handler(audited(experimentalExactInvoiceSchema, (input: ExactInvoiceVoid, audit) => service ? service.voidInvoice({ ...input, ...audit }) : unavailable())),
    deleteDraft: os.deleteDraft.handler(audited(removed, (input: ExactInvoiceCommand, audit) => service ? service.deleteDraft({ ...input, ...audit }) : unavailable())),
    createPayment: os.createPayment.handler(audited(exactPaymentSchema, (input: ExactPaymentCreate, audit) => service ? service.createPayment({ ...input, ...audit }) : unavailable())),
    allocatePayment: os.allocatePayment.handler(audited(exactPaymentSchema, (input: ExactPaymentAllocate, audit) => service ? service.allocatePayment({ ...input, ...audit }) : unavailable())),
    voidPayment: os.voidPayment.handler(audited(exactPaymentSchema, (input: ExactInvoiceVoid, audit) => service ? service.voidPayment({ ...input, ...audit }) : unavailable())),
    deleteUnallocatedPayment: os.deleteUnallocatedPayment.handler(audited(removed, (input: ExactInvoiceCommand, audit) => service ? service.deleteUnallocatedPayment({ ...input, ...audit }) : unavailable())),
  });
}
