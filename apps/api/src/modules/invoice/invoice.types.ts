export type InvoiceStatus = "DRAFT" | "RECEIVED" | "PAID";

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceDzd: number;
  totalDzd: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string | null;
  supplierName: string;
  supplierPhone: string | null;
  warehouseId: string | null;
  projectId: string | null;
  status: InvoiceStatus;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmountDzd: number;
  paidAmountDzd: number;
  remainingAmountDzd: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: InvoiceLineItem[];
}

export interface CreateInvoiceInput {
  id: string;
  invoiceNumber?: string | null;
  supplierName: string;
  supplierPhone?: string | null;
  warehouseId?: string | null;
  projectId?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  lineItems: {
    id: string;
    description: string;
    quantity: number;
    unitPriceDzd: number;
  }[];
}

export interface UpdateInvoiceInput {
  id: string;
  invoiceNumber?: string | null;
  supplierName?: string;
  supplierPhone?: string | null;
  warehouseId?: string | null;
  projectId?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  lineItems?: {
    id: string;
    description: string;
    quantity: number;
    unitPriceDzd: number;
  }[];
}

export interface InvoiceListFilters {
  status?: InvoiceStatus;
  supplierName?: string;
  warehouseId?: string;
  projectId?: string;
}

export type InvoiceListSortField = "createdAt" | "invoiceDate" | "totalAmountDzd";
export type SortDirection = "asc" | "desc";

export interface InvoiceListQuery {
  filters?: InvoiceListFilters;
  sort?: {
    field: InvoiceListSortField;
    direction: SortDirection;
  };
  cursor?: string;
  limit?: number;
}

export interface InvoicePagedResult {
  items: Invoice[];
  nextCursor: string | null;
  totalCount: number;
}

export interface ReceiveInvoiceResult {
  invoice: Invoice;
  debtEntryId: string;
}
