import type {
  Payment,
  PaymentAllocation,
  PaymentWithAllocations,
  PaymentListFilters,
  PaymentListSortField,
  SortDirection,
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

  deletePayment(id: string): Promise<void>;

  findAllocationsByPaymentId(paymentId: string): Promise<PaymentAllocation[]>;

  /**
   * Run a callback inside a database transaction.
   */
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
