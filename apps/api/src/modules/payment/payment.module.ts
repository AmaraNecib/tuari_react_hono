import { paymentAmountSchema, paymentListLimitSchema } from "@tuari/contracts";

import type { PaymentModule } from "./payment-module.interface";
import type { PaymentRepository } from "./payment.repository";
import type { InvoiceRepository } from "../invoice/invoice.repository";
import type { InvoiceDebtPort } from "../invoice/invoice.types";
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
} from "./payment.types";
import type {
  CreatePaymentInput,
  PaymentWithAllocations,
  Payment,
  PaymentListFilters,
  PaymentListSortField,
  SortDirection,
} from "./payment.types";

/**
 * PaymentModule — records payments against supplier invoices and
 * allocates the payment amount across one or more invoices.
 *
 * Each allocation:
 *  1. Validates the invoice exists, is RECEIVED, and has capacity
 *  2. Records a debt entry (PAYMENT) via the debt port
 *  3. Updates the invoice's paid_amount / remaining_amount
 *  4. Creates the payment_allocation link record
 *
 * The entire create+allocate operation is ACID within a single
 * SQLite transaction.
 *
 * Service-boundary defense-in-depth (issue #289): the ORPC wire gate already
 * rejects non-positive amounts, empty allocations, and invalid page limits;
 * the module seam re-validates the SAME shared contract primitives
 * (`paymentAmountSchema` / `paymentListLimitSchema` from @tuari/contracts) so
 * a direct caller can never record a zero/negative payment or a phantom
 * zero-allocation payment.
 */
export function createPaymentModule(
  paymentRepo: PaymentRepository,
  invoiceRepo: InvoiceRepository,
  debtPort: InvoiceDebtPort,
): PaymentModule {
  /**
   * Pure-input financial validation — safe outside the transaction (no DB
   * state). Reuses the wire-gate schemas so the module cannot drift from the
   * contract. Runs BEFORE the sum check so the specific invalid input is
   * reported instead of a confusing mismatch.
   */
  function assertValidCreateInput(input: CreatePaymentInput): void {
    if (!paymentAmountSchema.safeParse(input.totalAmount).success) {
      throw new PaymentInvalidAmountError(input.totalAmount);
    }
    if (input.allocations.length === 0) {
      throw new PaymentEmptyAllocationsError();
    }
    for (const alloc of input.allocations) {
      if (!paymentAmountSchema.safeParse(alloc.amount).success) {
        throw new PaymentInvalidAmountError(alloc.amount);
      }
    }
  }

  async function create(input: CreatePaymentInput): Promise<PaymentWithAllocations> {
    assertValidCreateInput(input);

    // Allocation-sum mismatch is a structural validation — safe
    // to check outside the transaction (pure input, no DB state).
    const totalAllocated = input.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocated !== input.totalAmount) {
      throw new PaymentAllocationSumMismatchError(input.totalAmount, totalAllocated);
    }

    const now = new Date().toISOString();

    const result = await paymentRepo.runInTransaction(async () => {
      // Group allocations by invoiceId so we validate the *combined*
      // amount against remainingCapacity (not each allocation in isolation).
      const allocGroups = new Map<string, { total: number; items: typeof input.allocations }>();
      for (const alloc of input.allocations) {
        const existing = allocGroups.get(alloc.invoiceId);
        if (existing) {
          existing.total += alloc.amount;
          existing.items.push(alloc);
        } else {
          allocGroups.set(alloc.invoiceId, { total: alloc.amount, items: [alloc] });
        }
      }

      for (const [invoiceId, group] of allocGroups) {
        const invoice = await invoiceRepo.findById(invoiceId);
        if (!invoice) {
          throw new PaymentInvoiceNotFoundError(invoiceId);
        }
        if (invoice.status !== "RECEIVED") {
          throw new PaymentInvoiceNotReceivedError(invoiceId, invoice.status);
        }
        if (group.total > invoice.remainingAmount) {
          throw new PaymentInvoiceOverAllocationError(
            invoiceId,
            group.total,
            invoice.remainingAmount,
          );
        }
      }

      const payment = await paymentRepo.createPayment({
        id: input.id,
        counterpartyType: input.counterpartyType,
        counterpartyId: input.counterpartyId,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        totalAmount: input.totalAmount,
        notes: input.notes ?? null,
        actorUserId: null,
        actorLabel: null,
        transactionId: null,
        createdAt: now,
        updatedAt: now,
      });

      for (const alloc of input.allocations) {
        // Record payment against the invoice's debt account.
        const paymentResult = await debtPort.recordInvoicePayment({
          invoiceId: alloc.invoiceId,
          amount: alloc.amount,
          direction: "PURCHASE",
          actorUserId: "",
          actorLabel: "",
          transactionId: "",
        });

        // Update invoice paid_amount / remaining_amount and possibly
        // transition to PAID when fully paid.
        const invoiceFullyPaid = paymentResult.newRemainingAmount <= 0;
        await invoiceRepo.updateStatus(
          alloc.invoiceId,
          invoiceFullyPaid ? "PAID" : "RECEIVED",
          {
            paidAmount: paymentResult.newPaidAmount,
            remainingAmount: paymentResult.newRemainingAmount,
          },
        );

        // Create the allocation link.
        await paymentRepo.createAllocation({
          id: crypto.randomUUID(),
          paymentId: payment.id,
          invoiceId: alloc.invoiceId,
          amount: alloc.amount,
          createdAt: now,
        });
      }

      return paymentRepo.findById(payment.id);
    });

    return result!;
  }

  return {
    async create(input: CreatePaymentInput): Promise<PaymentWithAllocations> {
      return create(input);
    },

    async findById(id: string): Promise<PaymentWithAllocations | null> {
      return paymentRepo.findById(id);
    },

    async listPaged(query: {
      filters?: PaymentListFilters;
      sort?: { field: PaymentListSortField; direction: SortDirection };
      cursor?: string;
      limit: number;
    }): Promise<{ items: Payment[]; nextCursor: string | null; totalCount: number }> {
      if (!paymentListLimitSchema.safeParse(query.limit).success) {
        throw new PaymentInvalidLimitError(query.limit);
      }

      const after = query.cursor
        ? (() => {
            try {
              const decoded = JSON.parse(
                Buffer.from(query.cursor!, "base64url").toString("utf8"),
              );
              if (
                !decoded ||
                typeof decoded !== "object" ||
                typeof decoded.id !== "string" ||
                (decoded.sortValue !== null &&
                  typeof decoded.sortValue !== "string" &&
                  typeof decoded.sortValue !== "number")
              ) {
                return undefined;
              }
              return {
                sortValue: decoded.sortValue,
                id: decoded.id,
              };
            } catch {
              return undefined;
            }
          })()
        : undefined;

      return paymentRepo.findPaged({
        filters: query.filters,
        sort: query.sort,
        after,
        limit: query.limit,
      });
    },

    async delete(id: string): Promise<void> {
      // Guarded atomic delete: existence + allocation check + delete run in
      // ONE lock-held repository transaction, so an allocation created between
      // the old check and the delete can no longer be silently cascade-deleted
      // (issue #289 gap 4).
      const result = await paymentRepo.deleteIfUnallocated(id);
      if (result.status === "NOT_FOUND") {
        throw new PaymentNotFoundError(id);
      }
      if (result.status === "HAS_ALLOCATIONS") {
        throw new PaymentHasAllocationsError(id, result.count);
      }
    },
  };
}
