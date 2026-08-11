import type { PaymentRepository } from "../payment.repository";
import type {
  Payment,
  PaymentAllocation,
  PaymentWithAllocations,
  PaymentListFilters,
  PaymentListSortField,
  SortDirection,
  PaymentDeleteResult,
} from "../payment.types";

export function createInMemoryPaymentRepository(): PaymentRepository {
  const payments = new Map<string, Payment>();
  const allocations = new Map<string, PaymentAllocation>();

  return {
    async findById(id: string): Promise<PaymentWithAllocations | null> {
      const payment = payments.get(id);
      if (!payment) return null;

      const paymentAllocations = Array.from(allocations.values()).filter(
        (a) => a.paymentId === id,
      );

      return { ...payment, allocations: paymentAllocations };
    },

    async findPaged(query: {
      filters?: PaymentListFilters;
      sort?: { field: PaymentListSortField; direction: SortDirection };
      after?: { sortValue: number | string | null; id: string };
      limit: number;
    }): Promise<{
      items: Payment[];
      nextCursor: string | null;
      totalCount: number;
    }> {
      let items = Array.from(payments.values());

      if (query.filters?.counterpartyType) {
        items = items.filter(
          (p) => p.counterpartyType === query.filters!.counterpartyType,
        );
      }
      if (query.filters?.counterpartyId) {
        items = items.filter(
          (p) => p.counterpartyId === query.filters!.counterpartyId,
        );
      }
      if (query.filters?.paymentMethod) {
        items = items.filter(
          (p) => p.paymentMethod === query.filters!.paymentMethod,
        );
      }

      const totalCount = items.length;

      const sortCol =
        query.sort?.field === "paymentDate"
          ? "paymentDate"
          : query.sort?.field === "totalAmount"
            ? "totalAmount"
            : "createdAt";

      const sortDir = query.sort?.direction === "asc" ? 1 : -1;

      items.sort((a, b) => {
        const aVal = a[sortCol as keyof Payment] as string | number;
        const bVal = b[sortCol as keyof Payment] as string | number;
        if (aVal < bVal) return -1 * sortDir;
        if (aVal > bVal) return 1 * sortDir;
        return 0;
      });

      if (query.after) {
        const cursorIdx = items.findIndex(
          (p) => p.id === query.after!.id,
        );
        if (cursorIdx !== -1) {
          items = items.slice(cursorIdx + 1);
        }
      }

      const hasMore = items.length > query.limit;
      items = hasMore ? items.slice(0, query.limit) : items;

      let nextCursor: string | null = null;
      if (hasMore && items.length > 0) {
        const last = items[items.length - 1]!;
        const lastSortVal = last[sortCol as keyof Payment] as string | number;
        nextCursor = Buffer.from(
          JSON.stringify({ sortValue: lastSortVal, id: last.id }),
        ).toString("base64url");
      }

      return { items, nextCursor, totalCount };
    },

    async createPayment(data: {
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
    }): Promise<Payment> {
      const payment: Payment = {
        id: data.id,
        counterpartyType: data.counterpartyType as Payment["counterpartyType"],
        counterpartyId: data.counterpartyId,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod as Payment["paymentMethod"],
        totalAmount: data.totalAmount,
        notes: data.notes,
        actorUserId: data.actorUserId,
        actorLabel: data.actorLabel,
        transactionId: data.transactionId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
      payments.set(data.id, payment);
      return { ...payment };
    },

    async createAllocation(data: {
      id: string;
      paymentId: string;
      invoiceId: string;
      amount: number;
      createdAt: string;
    }): Promise<PaymentAllocation> {
      const allocation: PaymentAllocation = {
        id: data.id,
        paymentId: data.paymentId,
        invoiceId: data.invoiceId,
        amount: data.amount,
        createdAt: data.createdAt,
      };
      allocations.set(data.id, allocation);
      return { ...allocation };
    },

    async deleteIfUnallocated(id: string): Promise<PaymentDeleteResult> {
      // Same guarded semantics as the sqlite adapter, with one honest
      // divergence: this double's `runInTransaction` is a pass-through, so a
      // module-level `create` (which yields at its own await points) can still
      // interleave with a `delete` — an outcome impossible on the sqlite path.
      // Within THIS method there are no awaits, so the check + delete complete
      // in one microtask and the guard itself can never observe a stale state.
      if (!payments.has(id)) {
        return { status: "NOT_FOUND" };
      }
      const count = Array.from(allocations.values()).filter(
        (a) => a.paymentId === id,
      ).length;
      if (count > 0) {
        return { status: "HAS_ALLOCATIONS", count };
      }
      payments.delete(id);
      return { status: "DELETED" };
    },

    async findAllocationsByPaymentId(
      paymentId: string,
    ): Promise<PaymentAllocation[]> {
      return Array.from(allocations.values()).filter(
        (a) => a.paymentId === paymentId,
      );
    },

    async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}
