import {
  Money, sumMoneyHistory, getLockedDirectionForCategory,
  createExactDebtAccountSchema, postExactDebtEntrySchema, payExactDebtEntrySchema,
  correctExactDebtEntrySchema, voidExactDebtEntrySchema, settleExactDebtAccountSchema,
  type CreateExactDebtAccount, type PostExactDebtEntry, type PayExactDebtEntry,
  type CorrectExactDebtEntry, type VoidExactDebtEntry, type SettleExactDebtAccount,
} from "@tuari/contracts";
import type { ExactDebtAccount, ExactDebtEntry, ExactFinanceRepository } from "./exact-finance.repository";

export class ExactDebtError extends Error {
  constructor(message: string, readonly code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" = "BAD_REQUEST") { super(message); }
}

export type ExactDebtAudit = { actorUserId?: string | null; actorLabel?: string | null; transactionId?: string | null };
type Command = ExactDebtAudit & { requestId: string };
const zero = () => Money.parse("0");
const limit = 100000;
const normalize = (value: unknown): unknown => {
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
  return value;
};

/** Inert exact ledger lifecycle. Production composition continues to use FinanceService. */
export class ExactFinanceService {
  constructor(private readonly repository: ExactFinanceRepository, private readonly dependencies: { id(): string; now(): string }) {}

  private command<T>(kind: string, input: Command, intent: unknown, work: () => T): T {
    const fingerprint = JSON.stringify(normalize({ kind, intent, actorUserId: input.actorUserId ?? null, actorLabel: input.actorLabel ?? null }));
    if (fingerprint.length > 16000) throw new ExactDebtError("Debt command resource limit exceeded");
    return this.repository.withTransaction(() => {
      const previous = this.repository.getCommand(input.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ExactDebtError("Debt command replay conflict", "CONFLICT");
        return JSON.parse(previous.resultJson) as T;
      }
      const result = work();
      this.repository.saveCommand({ id: input.requestId, fingerprint, resultJson: JSON.stringify(result) });
      return result;
    });
  }
  getAccount(id: string): ExactDebtAccount {
    const account = this.repository.getAccount(id);
    if (!account) throw new ExactDebtError("Debt account not found", "NOT_FOUND");
    return account;
  }
  listAccounts(): ExactDebtAccount[] {
    const rows = this.repository.listAccounts();
    if (rows.length > limit) throw new ExactDebtError("Debt account read limit exceeded");
    return rows;
  }
  listEntries(id: string): ExactDebtEntry[] {
    this.getAccount(id);
    const rows = this.repository.listEntries(id);
    if (rows.length > limit) throw new ExactDebtError("Debt entry read limit exceeded");
    return rows;
  }
  detail(id: string) {
    return this.repository.withTransaction(() => {
      const rows = this.listEntries(id);
      const remaining = this.remainingIndex(rows);
      return { account: this.getAccount(id), entries: rows.map(row => ({ ...row,
        remainingDzd: row.status === "LIVE" && !row.targetEntryId && !row.correctionOfEntryId ? remaining.get(row.id)!.toWire() : null,
      })) };
    });
  }
  summary() {
    return this.repository.withTransaction(() => {
      const accounts = this.listAccounts();
      const gross = (direction: ExactDebtAccount["direction"]) => sumMoneyHistory(accounts.map(row => {
        const amount = Money.parse(row.currentBalance, row.currency);
        const sameDirection = row.direction === direction;
        return sameDirection && amount.compare(zero()) > 0 ? amount
          : !sameDirection && amount.compare(zero()) < 0 ? amount.negate() : zero();
      }));
      return { accounts, grossPayableDzd: gross("PAYABLE"), grossReceivableDzd: gross("RECEIVABLE") };
    });
  }
  private liveEntry(id: string): ExactDebtEntry {
    const entry = this.repository.getEntry(id);
    if (!entry || entry.status !== "LIVE") throw new ExactDebtError("Live debt entry not found", "NOT_FOUND");
    return entry;
  }
  private obligation(id: string): ExactDebtEntry {
    const entry = this.liveEntry(id);
    if (entry.targetEntryId || entry.correctionOfEntryId || Money.parse(entry.signedAmountDzd).compare(zero()) === 0) throw new ExactDebtError("Target must be an original obligation");
    return entry;
  }
  createAccount(raw: CreateExactDebtAccount & ExactDebtAudit): ExactDebtAccount {
    const input = createExactDebtAccountSchema.parse(raw);
    const audit = this.audit(raw);
    return this.command("account", { ...input, ...audit }, input, () => {
      const workerId = input.workerId ?? null;
      const externalCounterpartyId = input.externalCounterpartyId ?? null;
      if (!this.repository.partyExists(input.partyType, workerId ?? externalCounterpartyId!)) throw new ExactDebtError("Debt party not found", "NOT_FOUND");
      const locked = input.reasonCategory ? getLockedDirectionForCategory(input.reasonCategory) : null;
      if (locked && locked !== input.direction) throw new ExactDebtError("Reason category direction mismatch");
      if (input.reasonCategory === "OTHER" && !input.reasonDetail) throw new ExactDebtError("Other reason requires detail");
      const accounts = this.listAccounts();
      let account = accounts.find(row => row.partyType === input.partyType && row.workerId === workerId && row.externalCounterpartyId === externalCounterpartyId && row.direction === input.direction && row.currency === input.currency);
      const now = this.dependencies.now();
      if (!account) {
        if (accounts.length >= limit) throw new ExactDebtError("Debt account write resource limit exceeded");
        account = { id: this.dependencies.id(), partyType: input.partyType, workerId, externalCounterpartyId, direction: input.direction, currency: input.currency, currentBalance: "0.00", status: "SETTLED", note: input.note ?? null, settledAt: now, ...audit, createdAt: now, updatedAt: now };
        this.repository.saveAccount(account);
      }
      const opening = Money.parse(input.openingBalanceDzd ?? "0", input.currency);
      if (opening.compare(zero()) > 0) this.append(account, {
        entryType: this.listEntries(account.id).length ? "ADJUSTMENT" : "OPENING", signedAmountDzd: opening.toWire(),
        entryDate: now, note: input.note, reasonCategory: input.reasonCategory, reasonDetail: input.reasonDetail,
      }, audit);
      return this.getAccount(account.id);
    });
  }
  postEntry(raw: PostExactDebtEntry & ExactDebtAudit): ExactDebtEntry {
    const input = postExactDebtEntrySchema.parse(raw);
    const audit = this.audit(raw);
    return this.command("post", { ...input, ...audit }, input, () => {
      const account = this.getAccount(input.debtAccountId);
      const amount = Money.parse(input.signedAmountDzd, input.currency);
      this.assertCurrency(account, input.currency);
      if (amount.compare(zero()) === 0) throw new ExactDebtError("Posting must be nonzero");
      const locked = input.reasonCategory ? getLockedDirectionForCategory(input.reasonCategory) : null;
      if (locked && locked !== account.direction) throw new ExactDebtError("Reason category direction mismatch");
      if (input.reasonCategory === "OTHER" && !input.reasonDetail) throw new ExactDebtError("Other reason requires detail");
      if (input.entryType === "ADVANCE" && (account.direction !== "RECEIVABLE" || account.partyType !== "INTERNAL_WORKER" || amount.compare(zero()) < 0)) throw new ExactDebtError("Advance requires a positive worker receivable");
      if (input.entryType === "OPENING" && (this.listEntries(account.id).length || amount.compare(zero()) < 0)) throw new ExactDebtError("Opening must be the first positive entry");
      return this.append(account, { ...input, entryDate: input.entryDate ?? this.dependencies.now() }, audit);
    });
  }
  private assertCurrency(account: ExactDebtAccount, currency: string): void {
    if (account.currency !== currency) throw new ExactDebtError("Currency mismatch");
  }
  private remainingIndex(rows: ExactDebtEntry[]): Map<string, Money> {
    const groups = new Map<string, Money[]>();
    for (const row of rows.filter(row => row.status === "LIVE")) {
      const key = row.targetEntryId ?? row.correctionOfEntryId ?? row.id;
      const values = groups.get(key) ?? [];
      values.push(Money.parse(row.signedAmountDzd, row.currency));
      groups.set(key, values);
    }
    return new Map([...groups].map(([id, values]) => [id, Money.parse(sumMoneyHistory(values))]));
  }
  private remainingFrom(target: ExactDebtEntry, rows: ExactDebtEntry[]): Money {
    return this.remainingIndex(rows).get(target.id)!;
  }
  remaining(id: string): string {
    return this.repository.withTransaction(() => {
      const target = this.obligation(id);
      return this.remainingFrom(target, this.listEntries(target.debtAccountId)).toWire();
    });
  }
  recordPayment(raw: PayExactDebtEntry & ExactDebtAudit): ExactDebtEntry {
    const input = payExactDebtEntrySchema.parse(raw);
    const audit = this.audit(raw);
    return this.command("payment", { ...input, ...audit }, input, () => {
      const target = this.obligation(input.debtEntryId);
      const account = this.getAccount(target.debtAccountId);
      this.assertCurrency(account, input.currency);
      const amount = Money.parse(input.amountDzd, input.currency);
      const remaining = this.remainingFrom(target, this.listEntries(account.id));
      if (remaining.compare(zero()) <= 0 || amount.compare(remaining) > 0) throw new ExactDebtError("Payment exceeds remaining obligation");
      return this.append(account, { entryType: "PAYMENT", signedAmountDzd: amount.negate().toWire(), targetEntryId: target.id, entryDate: this.dependencies.now(), paymentMethod: input.paymentMethod, note: input.note }, audit);
    });
  }
  correctEntry(raw: CorrectExactDebtEntry & ExactDebtAudit): ExactDebtEntry {
    const input = correctExactDebtEntrySchema.parse(raw);
    const audit = this.audit(raw);
    return this.command("correction", { ...input, ...audit }, input, () => {
      const target = this.obligation(input.entryId);
      const account = this.getAccount(target.debtAccountId);
      this.assertCurrency(account, input.currency);
      const rows = this.listEntries(account.id);
      const existingAmount = Money.parse(sumMoneyHistory(rows.filter(row => row.status === "LIVE" && (row.id === target.id || row.correctionOfEntryId === target.id)).map(row => Money.parse(row.signedAmountDzd))));
      const delta = Money.parse(input.amountDzd).subtract(existingAmount);
      if (delta.compare(zero()) === 0) throw new ExactDebtError("Correction must change the obligation");
      const originalSign = Money.parse(target.signedAmountDzd).compare(zero());
      if (Money.parse(input.amountDzd).compare(zero()) !== originalSign) throw new ExactDebtError("Correction cannot change the original obligation direction");
      const remainderSign = this.remainingFrom(target, rows).add(delta).compare(zero());
      if (remainderSign !== 0 && remainderSign !== originalSign) throw new ExactDebtError("Correction cannot invalidate recorded settled amounts");
      return this.append(account, { entryType: "ADJUSTMENT", signedAmountDzd: delta.toWire(), correctionOfEntryId: target.id, entryDate: this.dependencies.now(), note: input.reason, reasonCategory: target.reasonCategory, reasonDetail: target.reasonDetail }, audit);
    });
  }
  settleAccount(raw: SettleExactDebtAccount & ExactDebtAudit): ExactDebtEntry[] {
    const input = settleExactDebtAccountSchema.parse(raw);
    const audit = this.audit(raw);
    return this.command("settle", { ...input, ...audit }, input, () => {
      const account = this.getAccount(input.debtAccountId);
      this.assertCurrency(account, input.currency);
      const rows = this.listEntries(account.id);
      const results: ExactDebtEntry[] = [];
      const remainders = this.remainingIndex(rows);
      let current = account;
      const positive: ExactDebtEntry[] = [];
      const negative: ExactDebtEntry[] = [];
      for (const target of rows.filter(row => row.status === "LIVE" && !row.targetEntryId && !row.correctionOfEntryId)) {
        const sign = remainders.get(target.id)!.compare(zero());
        if (sign > 0) positive.push(target);
        if (sign < 0) negative.push(target);
      }
      // Reduce the current balance toward zero before reversing the opposite
      // sign. Re-evaluate after each posting; one fixed sign sort can overflow.
      while (positive.length || negative.length) {
        const targets = (Money.parse(current.currentBalance).compare(zero()) >= 0 && positive.length) || !negative.length ? positive : negative;
        const target = targets.pop()!;
        const remaining = remainders.get(target.id)!;
        const entry = this.append(current, { entryType: "SETTLEMENT", signedAmountDzd: remaining.negate().toWire(), targetEntryId: target.id, entryDate: this.dependencies.now(), note: input.note }, audit, rows);
        results.push(entry);
        rows.push(entry);
        current = { ...current, currentBalance: entry.balanceAfterDzd };
      }
      if (!results.length) throw new ExactDebtError("Account is already settled");
      return results;
    });
  }
  voidEntry(raw: VoidExactDebtEntry & ExactDebtAudit): ExactDebtEntry {
    const input = voidExactDebtEntrySchema.parse(raw);
    const audit = this.audit(raw);
    return this.command("void", { ...input, ...audit }, input, () => {
      const target = this.liveEntry(input.entryId);
      const account = this.getAccount(target.debtAccountId);
      this.assertCurrency(account, input.currency);
      const rows = this.listEntries(account.id);
      // Only the original obligation owns the recorded attribution. A correction
      // is a sibling of its payments, not permission to cancel them.
      const affected = rows.filter(row => row.id === target.id || row.targetEntryId === target.id || row.correctionOfEntryId === target.id);
      const now = this.dependencies.now();
      for (const row of affected.filter(row => row.status === "LIVE")) {
        this.repository.saveEntry({ ...row, status: "VOIDED", voidedAt: now, voidedBy: audit.actorLabel ?? audit.actorUserId, voidReason: input.voidReason, updatedAt: now });
      }
      this.recompute(account, audit);
      // Removing a correction must not invalidate its recorded settlements.
      if (target.correctionOfEntryId) {
        const original = this.obligation(target.correctionOfEntryId);
        const remainderSign = this.remainingFrom(original, this.listEntries(account.id)).compare(zero());
        if (remainderSign !== 0 && remainderSign !== Money.parse(original.signedAmountDzd).compare(zero())) throw new ExactDebtError("Void cannot invalidate recorded settled amounts");
      }
      return this.repository.getEntry(target.id)!;
    });
  }
  private recompute(account: ExactDebtAccount, audit: ExactDebtAudit): void {
    let balance = zero();
    for (const entry of this.listEntries(account.id).filter(row => row.status === "LIVE")) {
      balance = balance.add(Money.parse(entry.signedAmountDzd, account.currency));
      this.repository.saveEntry({ ...entry, balanceAfterDzd: balance.toWire() });
    }
    this.updateBalance(account, balance, audit);
  }
  private audit(input: ExactDebtAudit) { return { actorUserId: input.actorUserId ?? null, actorLabel: input.actorLabel ?? null, transactionId: input.transactionId ?? null }; }
  private updateBalance(account: ExactDebtAccount, balance: Money, audit: ExactDebtAudit): void {
    const now = this.dependencies.now();
    this.repository.saveAccount({ ...account, currentBalance: balance.toWire(), status: balance.compare(zero()) === 0 ? "SETTLED" : "OPEN", settledAt: balance.compare(zero()) === 0 ? now : null, updatedAt: now, ...this.audit(audit) });
  }
  private append(account: ExactDebtAccount, input: Partial<ExactDebtEntry> & { entryType: ExactDebtEntry["entryType"]; signedAmountDzd: string; entryDate: string }, audit: ExactDebtAudit, rows = this.listEntries(account.id)): ExactDebtEntry {
    if (rows.length >= limit) throw new ExactDebtError("Debt entry write resource limit exceeded");
    const latest = rows.at(-1);
    if (latest && input.entryDate < latest.entryDate) throw new ExactDebtError("Debt entry cannot be backdated");
    const amount = Money.parse(input.signedAmountDzd, account.currency);
    const balance = Money.parse(account.currentBalance, account.currency).add(amount);
    const now = this.dependencies.now();
    const entry: ExactDebtEntry = { id: this.dependencies.id(), debtAccountId: account.id, currency: account.currency, postingSequence: (latest?.postingSequence ?? 0) + 1, entryType: input.entryType, signedAmountDzd: amount.toWire(), balanceAfterDzd: balance.toWire(), entryDate: input.entryDate, note: input.note ?? null, reasonCategory: input.reasonCategory ?? "INVOICE_DRIVEN", reasonDetail: input.reasonDetail ?? null, paymentMethod: input.paymentMethod ?? null, status: "LIVE", voidedAt: null, voidedBy: null, voidReason: null, invoiceId: input.invoiceId ?? null, targetEntryId: input.targetEntryId ?? null, correctionOfEntryId: input.correctionOfEntryId ?? null, ...this.audit(audit), createdAt: now, updatedAt: now };
    this.repository.saveEntry(entry);
    this.updateBalance(account, balance, audit);
    return entry;
  }
}
