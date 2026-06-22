import type {
  Invoice,
  InvoiceCurrency,
  InvoiceLineItem,
  InvoiceListFilters,
  InvoiceListSortField,
  SortDirection,
} from "./invoice.types";

export interface InvoiceRepository {
  findById(id: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null>;
  findPaged(query: {
    filters?: InvoiceListFilters;
    sort?: { field: InvoiceListSortField; direction: SortDirection };
    after?: {
      sortValue: number | string | null;
      id: string;
      nullBoundaryPassed?: boolean;
    };
    limit: number;
  }): Promise<{ items: Invoice[]; nextCursor: string | null; totalCount: number }>;
  create(data: {
    id: string;
    invoiceNumber: string | null;
    supplierName: string;
    supplierPhone: string | null;
    warehouseId: string | null;
    projectId: string | null;
    status: "DRAFT";
    invoiceDate: string | null;
    dueDate: string | null;
    currency: InvoiceCurrency;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    notes: string | null;
    debtAccountId?: string | null;
    createdAt: string;
    updatedAt: string;
    lineItems: {
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }[];
  }): Promise<Invoice>;
  update(
    id: string,
    data: {
      invoiceNumber?: string | null;
      supplierName?: string;
      supplierPhone?: string | null;
      warehouseId?: string | null;
      projectId?: string | null;
      invoiceDate?: string | null;
      dueDate?: string | null;
      currency?: InvoiceCurrency;
      notes?: string | null;
      totalAmount?: number;
      remainingAmount?: number;
      debtAccountId?: string | null;
      updatedAt?: string;
      lineItems?: {
        id: string;
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }[];
    },
  ): Promise<Invoice>;
  updateStatus(
    id: string,
    status: "RECEIVED" | "PAID",
    additionalUpdates?: {
      paidAmount?: number;
      remainingAmount?: number;
    },
  ): Promise<Invoice>;
  markReceivedWithDebtAccount(
    id: string,
    debtAccountId: string,
  ): Promise<Invoice>;
  delete(id: string): Promise<void>;
  count(filters?: InvoiceListFilters): Promise<number>;
  /**
   * Run a callback inside a database transaction. Used to compose
   * multi-step writes (e.g. debt-port payment + invoice amount
   * update in markPaid) so a partial failure cannot leave the ledger
   * and the invoice out of sync.
   */
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
