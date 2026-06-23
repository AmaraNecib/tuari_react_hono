export type InvoiceStatus = "DRAFT" | "RECEIVED" | "PAID";

/**
 * Invoice direction. PURCHASE (default) means we owe the supplier;
 * SALE means the counterparty owes us.
 */
export type InvoiceDirection = "PURCHASE" | "SALE";

/**
 * Supported currencies. Today only DZD (Algerian Dinar) is wired
 * end-to-end; the schema and types are forward-compatible so adding
 * EUR / USD later is a config change, not a refactor.
 */
export type InvoiceCurrency = "DZD";

export const DEFAULT_INVOICE_CURRENCY: InvoiceCurrency = "DZD";

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string | null;
  supplierName: string;
  supplierPhone: string | null;
  warehouseId: string | null;
  projectId: string | null;
  status: InvoiceStatus;
  direction: InvoiceDirection;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: InvoiceCurrency;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  notes: string | null;
  debtAccountId: string | null;
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
  direction?: InvoiceDirection;
  invoiceDate?: string | null;
  dueDate?: string | null;
  currency?: InvoiceCurrency;
  notes?: string | null;
  lineItems: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
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
  direction?: InvoiceDirection;
  currency?: InvoiceCurrency;
  notes?: string | null;
  lineItems?: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export interface InvoiceListFilters {
  status?: InvoiceStatus;
  supplierName?: string;
  warehouseId?: string;
  projectId?: string;
}

export type InvoiceListSortField = "createdAt" | "invoiceDate" | "totalAmount";
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
  debtAccountId: string;
}

export interface InvoiceActorContext {
  actorUserId: string;
  actorLabel?: string;
  transactionId?: string;
}

export interface CreateInvoiceDebtInput {
  invoiceId: string;
  supplierName: string;
  supplierPhone: string | null;
  amount: number;
  currency: InvoiceCurrency;
  direction: InvoiceDirection;
  actorUserId: string;
  actorLabel?: string;
  transactionId?: string;
}

export interface RecordInvoicePaymentInput {
  invoiceId: string;
  amount: number;
  direction: InvoiceDirection;
  actorUserId: string;
  actorLabel?: string;
  transactionId?: string;
}

export interface RecordInvoicePaymentResult {
  debtAccountId: string;
  newPaidAmount: number;
  newRemainingAmount: number;
  settled: boolean;
  debtAccountCurrentBalance: number;
}

/**
 * Small port the InvoiceModule uses to talk to the debt system.
 * Keeping it as an interface (not a class) means the module is
 * testable without a debt module; production wires an adapter that
 * calls into the real debt service.
 */
export interface InvoiceDebtPort {
  createInvoiceDebt(input: CreateInvoiceDebtInput): Promise<{ debtAccountId: string }>;
  recordInvoicePayment(input: RecordInvoicePaymentInput): Promise<RecordInvoicePaymentResult>;
}

export interface InvoiceLineItemSeed {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// --- Typed errors ---
// Specific error classes so the handler can map them to ORPCError codes
// via `instanceof` instead of fragile `error.name === "..."` string matching.

export class InvoiceNotFoundError extends Error {
  constructor(public readonly invoiceId: string) {
    super(`Invoice ${invoiceId} not found`);
    this.name = "InvoiceNotFoundError";
  }
}

export class InvalidInvoiceStatusError extends Error {
  constructor(
    public readonly invoiceId: string,
    public readonly expected: InvoiceStatus,
    public readonly actual: InvoiceStatus,
  ) {
    super(
      `Invoice ${invoiceId} is in status ${actual}; expected ${expected}`,
    );
    this.name = "InvalidInvoiceStatusError";
  }
}

export class EmptyLineItemsError extends Error {
  constructor() {
    super("Invoice must have at least one line item");
    this.name = "EmptyLineItemsError";
  }
}

export class InvalidInvoiceCursorError extends Error {
  constructor(public readonly cursor: string) {
    super("Invalid cursor");
    this.name = "InvalidInvoiceCursorError";
  }
}

export class InvoiceDebtPortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceDebtPortError";
  }
}