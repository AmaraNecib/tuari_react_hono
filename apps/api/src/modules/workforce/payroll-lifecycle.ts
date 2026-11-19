import type { EmployeeEarning } from "@tuari/contracts";
import type { PayrollCashRecord, PayrollSettlementRecord } from "./payroll-cash.repository";
import type { PayrollOffsetRecord } from "./payroll-offset.repository";

export type PayrollOpeningSource = {
  readonly kind: "WAGE" | "ADVANCE";
  readonly sourceId: string;
  readonly employeeId: string;
  readonly currency: "DZD";
  readonly amount: string;
  readonly debtAccountId: string;
  readonly debtEntryId: string;
};

export type PayrollOpeningReview = {
  readonly state: "REVIEWED";
  readonly sources: readonly PayrollOpeningSource[];
};

/** Optional read-only #545 seam. Counts include review metadata and every source row. */
export interface PayrollOpeningReviewProvider {
  readonly transactionIdentity: { readonly connection: object; readonly lock: object };
  countRows(employeeId: string): number;
  getReview(employeeId: string): PayrollOpeningReview | null;
}

export type PayrollEarningLifecycle = {
  readonly earning: EmployeeEarning;
  readonly registration: "POSTED" | "PENDING_REGISTRATION";
  readonly remaining: string;
};

export type PayrollLifecycle = {
  readonly employeeId: string;
  readonly currency: "DZD";
  readonly earnings: readonly PayrollEarningLifecycle[];
  readonly cash: readonly PayrollCashRecord[];
  readonly repayments: readonly PayrollSettlementRecord[];
  readonly offsets: readonly PayrollOffsetRecord[];
  readonly advances: readonly { readonly cashId: string; readonly advance: NonNullable<PayrollCashRecord["advance"]>; readonly remaining: string }[];
  readonly opening: {
    readonly review: "UNREVIEWED" | "REVIEWED";
    readonly reminder: boolean;
    readonly wages: string | null;
    readonly advances: string | null;
  };
  readonly summary: {
    readonly approvedEarnings: string;
    readonly wageCashPaid: string;
    readonly wagesOffset: string;
    readonly wagesOwed: string;
    readonly advancesGiven: string;
    readonly advancesCashRecovered: string;
    readonly advancesOffset: string;
    readonly advancesOwed: string;
    readonly unallocatedEarnings: string;
    readonly currentAppTotalsExcludeUnknownOpening: boolean;
  };
};
