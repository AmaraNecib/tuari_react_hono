export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CHECK";
export type CounterpartyType = "EXTERNAL_COUNTERPARTY" | "WORKER";

export interface Payment {
  id: string;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  notes: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  createdAt: string;
}

export interface PaymentWithAllocations extends Payment {
  allocations: PaymentAllocation[];
}

export interface CreatePaymentAllocationInput {
  invoiceId: string;
  amount: number;
}

export interface CreatePaymentInput {
  id: string;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  notes?: string | null;
  allocations: CreatePaymentAllocationInput[];
}

export interface PaymentListFilters {
  counterpartyType?: CounterpartyType;
  counterpartyId?: string;
  paymentMethod?: PaymentMethod;
}

export type PaymentListSortField = "paymentDate" | "totalAmount" | "createdAt";
export type SortDirection = "asc" | "desc";

// --- Typed errors ---

export class PaymentNotFoundError extends Error {
  constructor(public readonly paymentId: string) {
    super(`Payment ${paymentId} not found`);
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentAllocationSumMismatchError extends Error {
  constructor(totalAmount: number, allocatedSum: number) {
    super(
      `Allocation sum (${allocatedSum}) does not match payment total (${totalAmount})`,
    );
    this.name = "PaymentAllocationSumMismatchError";
  }
}

export class PaymentInvoiceOverAllocationError extends Error {
  constructor(public readonly invoiceId: string, public readonly requested: number, public readonly available: number) {
    super(
      `Allocation amount ${requested} exceeds remaining invoice balance ${available} for invoice ${invoiceId}`,
    );
    this.name = "PaymentInvoiceOverAllocationError";
  }
}

export class PaymentInvoiceNotFoundError extends Error {
  constructor(public readonly invoiceId: string) {
    super(`Invoice ${invoiceId} not found`);
    this.name = "PaymentInvoiceNotFoundError";
  }
}

export class PaymentInvoiceNotReceivedError extends Error {
  constructor(public readonly invoiceId: string, public readonly status: string) {
    super(`Invoice ${invoiceId} is in status ${status}; expected RECEIVED`);
    this.name = "PaymentInvoiceNotReceivedError";
  }
}

export class PaymentHasAllocationsError extends Error {
  constructor(public readonly paymentId: string, public readonly allocationCount: number) {
    super(
      `Cannot delete payment ${paymentId}: ${allocationCount} allocation(s) exist. ` +
      "Void the allocations first.",
    );
    this.name = "PaymentHasAllocationsError";
  }
}
