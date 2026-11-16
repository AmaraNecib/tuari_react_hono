import { createRouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { createRpcMiddleware } from "./rpc-middleware";
import { createExactWorkforceEarningsRouter } from "./workforce-exact-earnings-router";
import type { RpcContext } from "./context";
import type { ExactWorkforceService } from "../modules/company/workforce-exact.service";

const user = { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0", permissions: [] };
const input = {
  requestId: "unknown-coded-error",
  employeeId: "worker",
  currency: "DZD" as const,
  months: [{ id: "november", month: "2026-11", amount: "100", unallocatedAmount: "100", segments: [] }],
};

describe("normal exact earnings RPC error propagation", () => {
  it("throws an unknown coded service error instead of parsing it as an approval result", async () => {
    const failure = Object.assign(new Error("synthetic sqlite failure"), { code: "SQLITE_ERROR" });
    const approveMonthlyEarnings = vi.fn(() => { throw failure; });
    const service = { approveMonthlyEarnings } as unknown as ExactWorkforceService;
    const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === user.id } });
    const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => user };
    const router = createExactWorkforceEarningsRouter(service, middleware);
    const client = createRouterClient(router, { context });

    await expect(client.approveMonthlyEarnings(input)).rejects.toBe(failure);
    expect(approveMonthlyEarnings).toHaveBeenCalledOnce();
  });
});
