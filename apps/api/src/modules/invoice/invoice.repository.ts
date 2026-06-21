import type {
  Invoice,
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
    after?: { createdAt: string; id: string };
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
    totalAmountDzd: number;
    paidAmountDzd: number;
    remainingAmountDzd: number;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    lineItems: {
      id: string;
      description: string;
      quantity: number;
      unitPriceDzd: number;
      totalDzd: number;
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
      notes?: string | null;
      totalAmountDzd?: number;
      remainingAmountDzd?: number;
      lineItems?: {
        id: string;
        description: string;
        quantity: number;
        unitPriceDzd: number;
        totalDzd: number;
      }[];
    },
  ): Promise<Invoice>;
  updateStatus(
    id: string,
    status: "RECEIVED" | "PAID",
    additionalUpdates?: {
      paidAmountDzd?: number;
      remainingAmountDzd?: number;
    },
  ): Promise<Invoice>;
  delete(id: string): Promise<void>;
  count(filters?: InvoiceListFilters): Promise<number>;
}
