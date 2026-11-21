import { describe, expect, it } from "vitest";
import { employeePayrollAdvanceOffsetInputSchema, employeePayrollCashRecordInputSchema, employeePayrollOutputSchema } from "./payroll";

describe("payroll RPC contracts", () => {
  it("accepts wide report totals beyond one stored Money value", () => {
    const wide = "92233720368547758.08";
    const output = { employeeId: "worker", currency: "DZD", earnings: [], cash: [], repayments: [], offsets: [], advances: [],
      opening: { review: "UNREVIEWED", reminder: true, wages: null, advances: null },
      summary: { approvedEarnings: wide, wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed: wide, advancesGiven: "0.00", advancesCashRecovered: "0.00", advancesOffset: "0.00", advancesOwed: "0.00", unallocatedEarnings: "0.00", currentAppTotalsExcludeUnknownOpening: true } };
    expect(employeePayrollOutputSchema.parse(output).summary.approvedEarnings).toBe(wide);
  });

  it("keeps opening report balances wide while command and persisted amounts stay bounded", () => {
    const wide = "184467440737095516.14";
    const output = { employeeId: "worker", currency: "DZD", earnings: [], cash: [], repayments: [], offsets: [], advances: [],
      opening: { review: "REVIEWED", reminder: false, wages: wide, advances: wide },
      summary: { approvedEarnings: "0.00", wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed: wide, advancesGiven: "0.00", advancesCashRecovered: "0.00", advancesOffset: "0.00", advancesOwed: wide, unallocatedEarnings: "0.00", currentAppTotalsExcludeUnknownOpening: false } };
    expect(employeePayrollOutputSchema.parse(output).opening).toMatchObject({ wages: wide, advances: wide });
    expect(employeePayrollOutputSchema.safeParse({ ...output, opening: { ...output.opening, wages: "-1.00" } }).success).toBe(false);
  });

  it("accepts only exact positive bounded DZD command amounts and rejects client audit fields", () => {
    const valid = { requestId: "cash-1", employeeId: "worker", amount: "1.25", paymentDate: "2026-11-18T09:00:00.000Z", wages: [{ earningId: "earning", amount: "1.25" }] };
    expect(employeePayrollCashRecordInputSchema.safeParse(valid).success).toBe(true);
    expect(employeePayrollCashRecordInputSchema.safeParse({ ...valid, actorUserId: "forged" }).success).toBe(false);
    expect(employeePayrollCashRecordInputSchema.safeParse({ ...valid, amount: 1.25 }).success).toBe(false);
    expect(employeePayrollCashRecordInputSchema.safeParse({ ...valid, amount: "1.001", wages: [{ earningId: "earning", amount: "1.001" }] }).success).toBe(false);
    expect(employeePayrollAdvanceOffsetInputSchema.safeParse({ requestId: "offset", employeeId: "worker", wageSource: { kind: "OPENING", id: "old" }, advanceSource: { kind: "ADVANCE", id: "advance" }, amount: "1.00", settlementDate: "2026-11-18T09:00:00.000Z" }).success).toBe(false);
  });
});
