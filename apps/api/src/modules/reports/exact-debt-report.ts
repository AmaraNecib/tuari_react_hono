import { Money } from "@tuari/contracts";
import { exactDebtReportSchema, type ExactDebtReport } from "../../../../../packages/contracts/src/debt-report-exact";
import { createAlgeriaTimestamp } from "../company/company-time";
import { MS_PER_DAY, type ReportDateFilter } from "../company/report.helpers";
import type { SqliteExactDebtReportSnapshot } from "./exact-debt-report-snapshot";

const wire = (minor: bigint): string => `${minor < 0n ? "-" : ""}${(minor < 0n ? -minor : minor) / 100n}.${String((minor < 0n ? -minor : minor) % 100n).padStart(2, "0")}`;
const minor = (amount: string): bigint => BigInt(Money.parse(amount).toMinorUnits());
const compare = (a: bigint, b: bigint) => a === b ? 0 : a > b ? -1 : 1;
const categories = ["0-30_DAYS", "31-60_DAYS", "60+_DAYS"] as const;

/** Window selects accounts by LIVE activity; amounts remain current, not historical-as-of. */
export class ExactDebtReportReader {
  constructor(private readonly snapshot: SqliteExactDebtReportSnapshot, private readonly now: () => string = createAlgeriaTimestamp) {}

  generate(input: ReportDateFilter): ExactDebtReport {
    const generatedAt = this.now();
    const start = input.startDate ? Date.parse(input.startDate) : -Infinity;
    const end = input.endDate ? Date.parse(input.endDate) : Infinity;
    const reportDate = input.endDate ? end : Date.parse(generatedAt);
    if (Number.isNaN(start) || Number.isNaN(end) || !Number.isFinite(reportDate) || start > end) throw new Error("Invalid debt report date window");
    return this.snapshot.read(({ accounts }) => {
      const aging = categories.map(ageCategory => ({ ageCategory, countOpen: 0, amount: 0n }));
      const parties = new Map<string, { partyId: string; partyName: string; partyType: "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY"; outstanding: bigint; settled: bigint; lastTransaction: string | null; latestEntry: number; latestPayment: number }>();
      let outstanding = 0n, settled = 0n, overdue = 0n;
      for (const { account, entries: history, partyName } of accounts) {
        const entries = history.filter(entry => entry.status === "LIVE");
        if (!entries.some(entry => Date.parse(entry.entryDate) >= start && Date.parse(entry.entryDate) <= end)) continue;
        // Derive current state from authoritative signed LIVE postings, never REAL caches.
        const balance = entries.reduce((total, entry) => total + minor(entry.signedAmountDzd), 0n);
        const open = balance !== 0n;
        const paidOff = !open ? entries.filter(entry => entry.entryType === "SETTLEMENT").reduce((total, entry) => {
          const value = minor(entry.signedAmountDzd);
          return total + (value < 0n ? -value : value);
        }, 0n) : 0n;
        const amount = open ? balance : 0n;
        const age = Math.max(0, Math.floor((reportDate - Math.min(...entries.map(entry => Date.parse(entry.entryDate)))) / MS_PER_DAY));
        outstanding += amount; settled += paidOff;
        if (open) {
          const bucket = aging[age <= 30 ? 0 : age < 60 ? 1 : 2]!;
          bucket.countOpen++; bucket.amount += amount;
          if (age >= 60) overdue += amount;
        }
        const partyId = account.workerId ?? account.externalCounterpartyId ?? account.id;
        const key = `${account.partyType}:${partyId}`;
        const party = parties.get(key) ?? { partyId, partyName, partyType: account.partyType, outstanding: 0n, settled: 0n, lastTransaction: null, latestEntry: 0, latestPayment: 0 };
        party.outstanding += amount; party.settled += paidOff;
        for (const entry of entries) {
          const ms = Date.parse(entry.entryDate);
          if (!party.lastTransaction || ms > Date.parse(party.lastTransaction)) party.lastTransaction = entry.entryDate;
          party.latestEntry = Math.max(party.latestEntry, ms);
          if (entry.entryType === "PAYMENT") party.latestPayment = Math.max(party.latestPayment, ms);
        }
        parties.set(key, party);
      }
      const values = [...parties.values()];
      return exactDebtReportSchema.parse({
        type: "DEBT", generatedAt,
        summary: { totalOutstandingDzd: wire(outstanding), totalSettledDzd: wire(settled), overdueDzd: wire(overdue), partyCount: parties.size },
        agingBreakdown: aging.map(bucket => ({ ageCategory: bucket.ageCategory, countOpen: bucket.countOpen, amountDzd: wire(bucket.amount) })),
        byParty: [...values].sort((a, b) => compare(a.outstanding, b.outstanding) || a.partyName.localeCompare(b.partyName, "ar")).map(party => ({ partyId: party.partyId, partyName: party.partyName, partyType: party.partyType, outstandingDzd: wire(party.outstanding), settledDzd: wire(party.settled), lastTransaction: party.lastTransaction })),
        topDebtors: values.filter(party => party.outstanding > 0n).sort((a, b) => compare(a.outstanding, b.outstanding)).slice(0, 10).map(party => ({ partyName: party.partyName, amountDzd: wire(party.outstanding), daysSinceLastPayment: Math.max(0, Math.floor((reportDate - (party.latestPayment > 0 ? party.latestPayment : party.latestEntry)) / MS_PER_DAY)) })),
      });
    });
  }
}
