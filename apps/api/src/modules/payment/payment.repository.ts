import type {
  Payment,
  PaymentAllocation,
  PaymentWithAllocations,
  PaymentListFilters,
  PaymentListSortField,
  SortDirection,
  PaymentDeleteResult,
} from "./payment.types";

export interface PaymentRepository {
  findById(id: string): Promise<PaymentWithAllocations | null>;

  findPaged(query: {
    filters?: PaymentListFilters;
    sort?: { field: PaymentListSortField; direction: SortDirection };
    after?: { sortValue: number | string | null; id: string };
    limit: number;
  }): Promise<{
    items: Payment[];
    nextCursor: string | null;
    totalCount: number;
  }>;

  createPayment(data: {
    id: string;
    counterpartyType: string;
    counterpartyId: string;
    paymentDate: string;
    paymentMethod: string;
    totalAmount: number;
    notes: string | null;
    actorUserId: string | null;
    actorLabel: string | null;
    transactionId: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<Payment>;

  createAllocation(data: {
    id: string;
    paymentId: string;
    invoiceId: string;
    amount: number;
    createdAt: string;
  }): Promise<PaymentAllocation>;

  /**
   * Atomically delete a payment ONLY if it has no allocations. The existence
   * check, the allocation check, and the delete run inside one lock-held
   * transaction (issue #289 gap 4) — an allocation created concurrently can
   * never be silently cascade-deleted.
   */
  deleteIfUnallocated(id: string): Promise<PaymentDeleteResult>;

  findAllocationsByPaymentId(paymentId: string): Promise<PaymentAllocation[]>;

  /**
   * Run a callback inside a database transaction.
   */
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
