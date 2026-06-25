import type { PaymentWithAllocations, Payment, PaymentListFilters, PaymentListSortField, SortDirection, CreatePaymentInput } from "./payment.types";

export interface PaymentModule {
  create(input: CreatePaymentInput): Promise<PaymentWithAllocations>;
  findById(id: string): Promise<PaymentWithAllocations | null>;
  listPaged(query: {
    filters?: PaymentListFilters;
    sort?: { field: PaymentListSortField; direction: SortDirection };
    cursor?: string;
    limit: number;
  }): Promise<{ items: Payment[]; nextCursor: string | null; totalCount: number }>;
  delete(id: string): Promise<void>;
}
