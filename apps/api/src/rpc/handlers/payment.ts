import crypto from "node:crypto";
import { implement, ORPCError } from "@orpc/server";

import type { PaymentModule } from "../../modules/payment/payment-module.interface";
import {
  PaymentAllocationSumMismatchError,
  PaymentInvoiceNotFoundError,
  PaymentInvoiceNotReceivedError,
  PaymentInvoiceOverAllocationError,
  PaymentNotFoundError,
  PaymentHasAllocationsError,
  PaymentEmptyAllocationsError,
  PaymentInvalidAmountError,
  PaymentInvalidLimitError,
} from "../../modules/payment/payment.types";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createPaymentHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  paymentModule: PaymentModule,
) {
  return {
    paymentsList: os.paymentsList.handler(
      m.withPermission(
        "payments:read",
        m.withAuth(async ({ input }: { context: RpcContext; input: unknown }) => {
          const opts = (input ?? {}) as {
            filters?: unknown;
            cursor?: string;
            limit?: number;
            sort?: { field: string; direction: "asc" | "desc" };
          };

          let result;
          try {
            result = await paymentModule.listPaged({
              filters: opts.filters as never,
              cursor: opts.cursor,
              limit: opts.limit ?? 50,
              sort: opts.sort as never,
            });
          } catch (error) {
            // Defense-in-depth: the wire gate already enforces 1..100, but a
            // module validation error must never escape as a 500.
            if (error instanceof PaymentInvalidLimitError) {
              throw new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          }

          return { ...result, hasMore: result.nextCursor !== null };
        }),
      ),
    ),

    paymentsGet: os.paymentsGet.handler(
      m.withPermission(
        "payments:read",
        m.withAuth(async ({ input }: { context: RpcContext; input: unknown }) => {
          const id = (input as { id: string }).id;
          const payment = await paymentModule.findById(id);
          if (!payment) {
            throw new ORPCError("NOT_FOUND", { message: "Payment not found" });
          }
          return payment;
        }),
      ),
    ),

    paymentsCreate: os.paymentsCreate.handler(
      m.withPermission(
        "payments:create",
        m.withAudit(
          async ({ input }: { context: RpcContext; input: unknown; auditContext: unknown }) => {
            const raw = input as {
              counterpartyType: string;
              counterpartyId: string;
              paymentDate: string;
              paymentMethod: string;
              totalAmount: number;
              notes?: string | null;
              allocations: Array<{ invoiceId: string; amount: number }>;
              id?: string;
            };

            const payment = await paymentModule.create({
              id: raw.id ?? crypto.randomUUID(),
              counterpartyType: raw.counterpartyType as "EXTERNAL_COUNTERPARTY" | "WORKER",
              counterpartyId: raw.counterpartyId,
              paymentDate: raw.paymentDate,
              paymentMethod: raw.paymentMethod as "CASH" | "BANK_TRANSFER" | "CHECK",
              totalAmount: raw.totalAmount,
              notes: raw.notes ?? null,
              allocations: raw.allocations.map((a) => ({
                invoiceId: a.invoiceId,
                amount: a.amount,
              })),
            });

            return payment;
          },
          (error: unknown) => {
            if (error instanceof PaymentAllocationSumMismatchError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            if (error instanceof PaymentEmptyAllocationsError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            if (error instanceof PaymentInvalidAmountError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            if (error instanceof PaymentInvoiceNotFoundError) {
              return new ORPCError("NOT_FOUND", { message: error.message });
            }
            if (error instanceof PaymentInvoiceNotReceivedError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            if (error instanceof PaymentInvoiceOverAllocationError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          },
        ),
      ),
    ),

    paymentsDelete: os.paymentsDelete.handler(
      m.withPermission(
        "payments:delete",
        m.withAudit(
          async ({ input }: { context: RpcContext; input: unknown; auditContext: unknown }) => {
            await paymentModule.delete((input as { id: string }).id);
            return { success: true };
          },
          (error: unknown) => {
            if (error instanceof PaymentNotFoundError) {
              return new ORPCError("NOT_FOUND", { message: error.message });
            }
            if (error instanceof PaymentHasAllocationsError) {
              return new ORPCError("CONFLICT", { message: error.message });
            }
            throw error;
          },
        ),
      ),
    ),
  };
}
