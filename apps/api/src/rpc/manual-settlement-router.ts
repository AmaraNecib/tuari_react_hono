import { implement, ORPCError } from "@orpc/server";
import { ZodError } from "zod";
import { manualSettlementContract, manualSettlementConfirmOutputSchema, manualSettlementReverseOutputSchema } from "@tuari/contracts";
import { FifoLockBusyError } from "../infrastructure/database/fifo-lock";
import { ExactDebtError } from "../modules/company/exact-finance.service";
import { ManualSettlementAuthorizationError, ManualSettlementUncommittedError, type ManualSettlementService } from "../modules/company/manual-settlement.service";
import { requireCurrentUser, type RpcContext } from "./context";
import type { RpcMiddleware } from "./rpc-middleware";

export type ManualSettlementCapability = (authenticatedUserId: string) => ManualSettlementService;
function resolveError(error: unknown): unknown {
  if (error instanceof ManualSettlementAuthorizationError) return new ORPCError("FORBIDDEN", { message: error.message });
  if (error instanceof ManualSettlementUncommittedError) return new ORPCError(error.code, { message: error.message, data: { manualSettlementOutcome: "UNCOMMITTED" } });
  if (error instanceof ExactDebtError) return new ORPCError(error.code, { message: error.message });
  if (error instanceof ZodError) return new ORPCError("BAD_REQUEST", { message: "Invalid settlement input" });
  if (error instanceof FifoLockBusyError || (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_BUSY"))) return new ORPCError("CONFLICT", { message: "Ledger is busy. Retry the same request." });
  throw error;
}
export function createManualSettlementRouter(capability: ManualSettlementCapability | undefined, middleware: RpcMiddleware) {
  const os = implement(manualSettlementContract).$context<RpcContext>();
  async function service(context: RpcContext) {
    const user = await requireCurrentUser(context);
    if (!capability) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Disposable manual settlement capability is not enabled" });
    return capability(user.id);
  }
  return os.router({
    candidates: os.candidates.handler(middleware.withAuth(async ({ context, input }) => {
      try { return (await service(context)).candidates(input); } catch (error) { throw resolveError(error); }
    })),
    accountHistory: os.accountHistory.handler(middleware.withAuth(async ({ context, input }) => {
      try { return (await service(context)).accountHistory(input); } catch (error) { throw resolveError(error); }
    })),
    preview: os.preview.handler(middleware.withAuth(async ({ context, input }) => {
      try { return (await service(context)).preview(input); } catch (error) { throw resolveError(error); }
    })),
    history: os.history.handler(middleware.withAuth(async ({ context, input }) => {
      try { return (await service(context)).history(input); } catch (error) { throw resolveError(error); }
    })),
    confirm: os.confirm.handler(async params => manualSettlementConfirmOutputSchema.parse(await middleware.withAudit(async ({ context, input }: { context: RpcContext; input: Parameters<ManualSettlementService["confirm"]>[0] }) => (await service(context)).confirm(input), resolveError)(params))),
    reverse: os.reverse.handler(async params => manualSettlementReverseOutputSchema.parse(await middleware.withAudit(async ({ context, input }: { context: RpcContext; input: Parameters<ManualSettlementService["reverse"]>[0] }) => (await service(context)).reverse(input), resolveError)(params))),
  });
}
