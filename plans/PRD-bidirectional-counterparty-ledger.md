# PRD: Bidirectional Counterparty Ledger & Debt UX Overhaul

**Status**: Ready for Agent
**Triage**: `ready-for-agent`
**Created**: 2026-06-22
**Parent PRD**: `PRD-production-readiness.md` (this PRD is a vertical extension of that effort)
**Predecessor plan**: `plans/002-debt-ux-overhaul/plan.md` (feature list — this PRD is the canonical version)

---

## Problem Statement

Today, every party in Tuari (worker OR external counterparty) has at most ONE debt account, and that account only models the **payable** side (money the entrepreneur owes the party — supplier / vendor / lender cases). Five concrete user-visible gaps:

1. **A party cannot owe the entrepreneur money.** If a supplier borrows tools from the entrepreneur's warehouse, or a customer pays in advance for a future project, the entrepreneur has no way to track that "they owe us" receivable. Similarly, if a worker takes cash from the till or owes the company for damaged equipment, the entrepreneur has no formal way to record that receivable against the worker. The current model forces the entrepreneur into ad-hoc notes or a separate spreadsheet.

2. **The net financial position of a party is invisible.** When the same party appears on both sides (e.g. a worker who got a salary advance last month AND paid a water bill on our behalf yesterday), the entrepreneur cannot see at a glance whether we still owe them, they still owe us, or everything is settled. They must mentally combine multiple debt-account balances and remember which sign convention applies.

3. **Worker-side debt is invisible on the employee detail page.** Salary advances, reimbursements, cash advances — all of these flow through `debt_account` rows keyed by `worker_id`, but the employee detail UI has no tab surfacing them. The entrepreneur must navigate to the debts hub to see them, losing the per-worker context.

4. **Debt reasons are not captured.** Every debt entry has an amount and a date, but no explanation of WHY the debt exists. A salary advance and a reimbursement and a loan are all indistinguishable in the ledger. Auditing "what was this money for?" requires the entrepreneur to remember.

5. **The debt UX is fragmented.** External persons are nested under `/debts/counterparties` rather than being a first-class entity. Creating a debt involves several clicks and an awkward redirect. There is no per-person "all debts" view, no inline payment processing, no way to consolidate (net) two debts against each other, and no consolidated hub that surfaces what's outstanding.

The entrepreneur cannot run a real construction business with bidirectional cash flow on these gaps. Customers expect to see "we still owe Mr X 12,500 DZD" or "Mr X owes us 7,300 DZD" in a glance, with a single click to drill into the breakdown.

---

## Solution

Introduce a **bidirectional party ledger**: every party (worker OR external counterparty) gets up to two debt accounts (one PAYABLE, one RECEIVABLE), each tracked with the same balance-based sign convention. The data layer stays signed (clean math); the UI displays absolute values with color + explicit label so the user always sees "how much" without a leading minus sign.

Two flows create debt entries:
- **Invoice-driven flow** (external counterparties only) — a purchase or sale invoice creates an OPENING on the appropriate PAYABLE or RECEIVABLE account
- **Direct debt flow** (workers AND external counterparties) — a 3-step wizard with a required reason category captures debts that are NOT tied to an invoice (salary advances, reimbursements, loans, etc.)

On top of the new data model, deliver a complete **Debt UX overhaul**: external persons become a first-class sidebar section; worker detail pages get a debt tab; the debt creation wizard is streamlined; payments are recorded inline; debts can be consolidated; and the debts hub surfaces what needs attention.

### Sign convention (locked in)

| Account direction | OPENING event | PAYMENT event | Meaning of `+` balance |
|---|---|---|---|
| `PAYABLE` (we owe them) | `+amount` (we now owe more) | `-amount` (we now owe less) | we owe them (liability) |
| `RECEIVABLE` (they owe us) | `+amount` (they now owe more) | `-amount` (they now owe less) | they owe us (asset) |

**Net per party** = `sum(receivable.current_balance) − sum(payable.current_balance)`

UI presentation:
- Display: `|net_balance|` as a positive number with currency
- Label + color (NEVER color alone — accessibility):
  - Green + "They owe us" → `net > 0`
  - Red + "We owe them" → `net < 0`
  - Gray + "Settled" → `net == 0`

### Reason category (locked in)

Every direct-debt OPENING carries a **required reason category** from a closed enum:

| Category | Direction | Typical scenario |
|---|---|---|
| `SALARY_ADVANCE` | PAYABLE | We gave the worker money before they earned it |
| `REIMBURSEMENT` | PAYABLE | Worker paid something on our behalf (water bill, materials, travel) |
| `CASH_TAKE` | RECEIVABLE | Worker took cash from the till |
| `EQUIPMENT_DAMAGE` | RECEIVABLE | Worker owes us for damaged equipment |
| `PERSONAL_LOAN` | RECEIVABLE | We gave the worker a cash loan, to be repaid |
| `DIRECT_LOAN_GIVEN` | RECEIVABLE | We gave an external counterparty a loan |
| `DIRECT_LOAN_TAKEN` | PAYABLE | An external counterparty lent us money |
| `OTHER` | (caller chooses) | Catch-all — free-text detail becomes the primary description |

Direction is **locked per category** — the user cannot override. The system rejects category+direction mismatches at validation. Free-text detail is required for `OTHER`, optional for the rest.

### Void + cascade (locked in)

Entries are immutable once created. Corrections use a **status-based void** pattern:
- An entry transitions to `VOIDED` status; it does not appear in balance calculations
- Voiding requires a non-empty `void_reason`; actor is auto-captured
- Voiding an OPENING **auto-cascades** to all live payments against it (with explicit UI warning)
- Cascaded voids are recorded in audit with `void_reason = "Auto-voided with OPENING #XYZ"`

### Payment method (locked in)

PAYMENT entries carry an optional `payment_method` (defaults to `CASH`). The user can change to `BANK_TRANSFER` or `CHECK` but is not required to. An optional free-text note can accompany any payment.

---

## User Stories

### Data Model Stories

1. As an entrepreneur, I want each counterparty to have a payable account, so that money I owe them is tracked separately from money they owe me.
2. As an entrepreneur, I want each counterparty to optionally have a receivable account, so that money they owe me is tracked on the same ledger.
3. As an entrepreneur, I want the running balance on each account to update atomically when I record an invoice opening or a payment, so that the ledger and the invoice cannot drift apart.
4. As an entrepreneur, I want two counterparties with the same name to be treated as different people, so that I can have multiple suppliers called "Mohamed" without confusion.
5. As an entrepreneur, I want to be able to record a sale to a counterparty that I also buy from, so that the same person can be both customer and supplier.
6. As an entrepreneur, I want the debt-account balance column to be renamed from `current_balance_dzd` to `current_balance`, so that the column name matches the rest of the schema (no DZD suffix anywhere).
7. As an entrepreneur, I want the rename migration to be idempotent and safe for existing deployments, so that upgrading to this version does not lose data.
8. As an entrepreneur, I want any pre-existing debt accounts to be classified as PAYABLE on first upgrade, so that historical data stays consistent with the old behavior.
9. As an entrepreneur, I want the system to prevent two payable accounts (or two receivable accounts) for the same counterparty, so that the ledger cannot accidentally duplicate entries.
10. As an entrepreneur, I want concurrent payments against the same counterparty to be safe, so that two simultaneous "record payment" calls cannot leave the ledger inconsistent.

### List & Detail View Stories

11. As an entrepreneur, I want a list of all counterparties, so that I can see who I do business with at a glance.
12. As an entrepreneur, I want each row in the counterparty list to show the net balance as a positive number, so that I don't have to interpret a leading minus sign.
13. As an entrepreneur, I want the net balance to be colored green when the counterparty owes me, so that I can spot receivables at a glance.
14. As an entrepreneur, I want the net balance to be colored red when I owe the counterparty, so that I can spot payables at a glance.
15. As an entrepreneur, I want an explicit text label next to the color ("They owe us" / "We owe them" / "Settled"), so that the direction is unambiguous regardless of color perception.
16. As an entrepreneur, I want to click a counterparty to see a detail page, so that I can drill into the full breakdown.
17. As an entrepreneur, I want the detail page to show the receivable balance, the payable balance, and the net balance on three lines, so that I can see where the net came from.
18. As an entrepreneur, I want the detail page to list every debt entry (opening, payment, consolidation) in chronological order, so that I can audit the history.
19. As an entrepreneur, I want settled counterparties (net == 0) to be visually distinguishable from active ones, so that I can focus on what needs attention.

### External Persons Sidebar Stories

20. As an entrepreneur, I want a top-level "External Persons" sidebar section, so that external people are first-class entities I can manage independently of debts.
21. As an entrepreneur, I want the External Persons page to show a list with search and filter, so that I can quickly find a specific person.
22. As an entrepreneur, I want to create a new external person from the list page, so that I can add a new supplier or customer without leaving the section.
23. As an entrepreneur, I want each external person to have a detail page with their info and their debt summary, so that all info about one person lives in one place.

### Debt Creation Stories

24. As an entrepreneur, I want a "New Debt" button on the debts hub page and on a person's detail page, so that I can create a debt from any relevant context.
25. As an entrepreneur, I want a step-by-step debt creation wizard (party type → party selection → amount & direction → note), so that the flow is predictable and forgiving of mistakes.
26. As an entrepreneur, I want to choose between "They owe us" and "We owe them" with a toggle (not a signed input), so that the form is unambiguous for non-technical users.
27. As an entrepreneur, I want to enter a positive amount with the direction toggle, so that I never have to think about signs.
28. As an entrepreneur, I want to add an optional free-text note (e.g. "Loan for materials, March 2026"), so that the debt has a human-readable case.
29. As an entrepreneur, I want a "+" button next to the external person selector to create a new person inline, so that I don't lose my place in the debt creation flow.
30. As an entrepreneur, I want to be redirected back to the debt creation page after creating a new external person, so that the new person is pre-selected and I can finish the debt in one go.

### Payment Processing Stories

31. As an entrepreneur, I want to record a payment against a specific debt from the debt detail page, so that the action is one click away from the context.
32. As an entrepreneur, I want to enter the payment amount and have it validated against the outstanding balance, so that I cannot over-pay by mistake.
33. As an entrepreneur, I want the payment to atomically reduce the outstanding balance and create a debt entry, so that the ledger and the entry cannot drift apart.
34. As an entrepreneur, I want to record a partial payment, so that I can settle a debt in multiple installments.
35. As an entrepreneur, I want to record a full payment that zeroes out the balance, so that the debt is marked settled.
36. As an entrepreneur, I want to record a payment that comes from a counterparty (on a receivable), so that incoming cash flow is captured the same way as outgoing.

### Debt Consolidation Stories

37. As an entrepreneur, I want to select two debts against the same counterparty (one payable, one receivable) and consolidate them into one, so that the smaller cancels out part of the larger.
38. As an entrepreneur, I want the consolidation to produce a single remaining debt equal to the net of the two, so that the ledger reflects the actual outstanding position.
39. As an entrepreneur, I want the consolidation to be recorded as a debt entry on each of the two original debts (for audit), so that the history is preserved.
40. As an entrepreneur, I want to be blocked from consolidating debts of the same direction (e.g. two payables), so that the operation has unambiguous semantics.

### Hub & Polish Stories

41. As an entrepreneur, I want the debts hub page to show a summary of total outstanding across all counterparties, so that I see the big picture.
42. As an entrepreneur, I want the hub to highlight counterparties with the largest outstanding balances, so that I can focus on what matters.
43. As an entrepreneur, I want the overscroll background bleed in dark mode to be fixed, so that the app looks clean while scrolling.
44. As an entrepreneur, I want every new UI string to be available in Arabic and English, so that both languages stay in sync.
45. As an entrepreneur, I want every new UI component to work in RTL layout, so that Arabic users get a native experience.

### Permission & Audit Stories

46. As an entrepreneur, I want debt mutations (create, pay, consolidate) to require the `debts.write` permission, so that read-only users cannot modify the ledger.
47. As an entrepreneur, I want every mutation to record `actorUserId`, `actorLabel`, and `transactionId`, so that the audit trail is preserved end-to-end.
48. As an entrepreneur, I want the existing role-based permission system (Issue #10) to be reused for all new endpoints, so that the permission model stays consistent.

### Worker-Side Debt Stories

53. As an entrepreneur, I want to see a "Debts" tab on the employee detail page, so that all debt entries for a worker are visible in one place.
54. As an entrepreneur, I want the worker debt tab to show the receivable balance, payable balance, and net balance, so that I can see the worker's full position at a glance.
55. As an entrepreneur, I want a "New debt" button on the worker debt tab, so that I can record a salary advance or reimbursement without leaving the worker context.
56. As an entrepreneur, I want to record a salary advance for a worker with one click from the worker detail page, so that I don't have to navigate through the wizard.
57. As an entrepreneur, I want to record a reimbursement for a worker (worker paid a bill on our behalf), so that I can track what I owe the worker for out-of-pocket expenses.
58. As an entrepreneur, I want to record a cash advance to a worker (worker took cash from the till), so that the worker's receivable to the company is tracked.
59. As an entrepreneur, I want to record equipment damage owed by a worker, so that the receivable is formally tracked and visible on payroll.
60. As an entrepreneur, I want to record a personal loan to a worker (cash we gave them, to be repaid), so that the receivable is tracked with a clear reason.
61. As an entrepreneur, I want the wizard to require me to pick a reason category when creating a direct debt, so that every debt has a "why" attached for audit.
62. As an entrepreneur, I want the system to derive the direction from the category I pick, so that I never have to think about signs — the system shows "We owe this worker" or "They owe us" based on the category.
63. As an entrepreneur, I want the wizard to require a free-text detail when I pick "OTHER" as the category, so that catch-all debts still have a meaningful description.
64. As an entrepreneur, I want worker debts to appear in the unified debts hub, so that I see all outstanding balances (worker + external) in one place.

### Correction & Audit Stories

65. As an entrepreneur, I want to void a debt entry if I created it by mistake, so that the ledger reflects reality without losing history.
66. As an entrepreneur, I want the system to require a non-empty reason when I void an entry, so that the audit trail captures why.
67. As an entrepreneur, I want voiding an OPENING to automatically void its live payments, so that the balance returns to zero cleanly when an entire debt didn't happen.
68. As an entrepreneur, I want to be warned before a cascade void, so that I can cancel if I didn't realize the OPENING had payments.
69. As an entrepreneur, I want to void a payment independently of its OPENING, so that I can correct a payment without touching the underlying debt.

### Payment Method Stories

70. As an entrepreneur, I want every payment to default to CASH, so that the common case requires zero clicks.
71. As an entrepreneur, I want to switch a payment to BANK_TRANSFER or CHECK if I'm recording a non-cash payment, so that the method is captured for cash-flow reports.
72. As an entrepreneur, I want an optional free-text note on every payment, so that I can add context like "partial settlement per agreement of 2026-03-15".

### Cross-Cutting Stories

73. As an entrepreneur, I want all of the above to work on a fresh database and on an upgraded database, so that the deployment story is the same for everyone.
74. As an entrepreneur, I want 100% test coverage on every new and modified module, so that the next refactor is safe.
75. As an entrepreneur, I want the full CI pipeline to be green, so that the work is production-ready on day one.
76. As an entrepreneur, I want every Greptile review of this work to land at 5/5, so that no P0/P1 issues remain.

---

## Implementation Decisions

### Data model decisions

- **`direction` enum on `debt_account`**: `'PAYABLE' | 'RECEIVABLE'`, NOT NULL, defaults to `'PAYABLE'` for backfill. New column added via idempotent migration (guarded by `hasColumn`).
- **Uniqueness**: `(external_counterparty_id, direction)` is unique AND `(worker_id, direction)` is unique. A party may have at most one of each direction. The two-party CHECK constraint remains (worker XOR external).
- **Backfill**: existing rows get `direction='PAYABLE'`. This preserves historical semantics (today's single account per party is always payable).
- **Sign convention is balance-based, not cash-flow-based**: see Solution section. Documented in a `ledger-direction.ts` constants module so every callsite uses named constants instead of magic strings.
- **Reason category on `debt_entry`**: a new `reason_category` column on `debt_entry` (NOT NULL going forward; existing invoice-driven entries get `'INVOICE_DRIVEN'` as the implicit category). The 8 enum values + the implicit `INVOICE_DRIVEN` are listed in the Solution section.
- **Reason detail on `debt_entry`**: a new `reason_detail` column (TEXT, nullable). Required for `OTHER` category, optional for the rest.
- **Category locks direction**: the system rejects any OPENING where `direction` doesn't match the category's implied direction. The validation is centralized in a single helper so every entry point (invoice-driven, direct debt, future bulk imports) enforces it.
- **Payment method on `debt_entry`**: a new `payment_method` column (TEXT, nullable, defaults to `CASH` for new PAYMENT entries). OPENING entries leave it NULL. The enum is `'CASH' | 'BANK_TRANSFER' | 'CHECK'`.
- **Void status on `debt_entry`**: a new `status` column (TEXT, NOT NULL, DEFAULT `'LIVE'`). Allowed values: `'LIVE' | 'VOIDED'`. Balance calculation excludes VOIDED.
- **Void metadata**: `voided_at` (TIMESTAMP), `voided_by` (TEXT), `void_reason` (TEXT, NOT NULL when status='VOIDED'). Set together atomically.
- **Cascade void** is application-level, not SQL-level: the void operation is one transaction that updates the OPENING + all live payments in one `db.transaction()` call. Each cascaded payment gets `void_reason = "Auto-voided with OPENING #<id>"`.

### Module architecture decisions

- **`CounterpartyLedgerModule`** — new module under `apps/api/src/modules/counterparty/`. Public interface: `getNetBalance(partyId)`, `getDetail(partyId)`, `recordOpening(input)`, `recordPayment(input)`, `consolidate(input)`, `voidEntry(entryId, reason)`, `listParties(query)`. Same shape as today's `InvoiceModule` (deep implementation, port-driven).
- **`CounterpartyLedgerPort`** — port interface. Methods take a `direction` argument (or a discriminated union). Adapters: `SqliteCounterpartyLedgerPort` and `InMemoryCounterpartyLedgerPort`.
- **Reuse `runInTransaction<T>`** — established in #11. All multi-step writes (record opening + cascade validation, record payment + reduce balance, consolidate + record entries, void + cascade) wrap the port call in `repo.runInTransaction`.
- **Reuse `InvoiceDebtPort` where possible** — extend it with a `direction` argument on `createInvoiceDebt` and `recordInvoicePayment` rather than splitting into two ports. Splitting would duplicate atomicity logic.
- **Worker + external parity**: the module treats both party types identically. The wizard, the detail page, the list view, and the void flow all work for workers and externals without code duplication.

### Schema migration decisions

- **`runDebtAccountBalanceRenameMigration`** — idempotent rename of `current_balance_dzd` → `current_balance` via `ALTER TABLE ... RENAME COLUMN`, guarded by `hasColumn` check, wrapped in a transaction, recorded in `app_schema_state`.
- **`runCounterpartyLedgerDirectionMigration`** — idempotent add of `direction` column + backfill + uniqueness constraints on `(external_counterparty_id, direction)` and `(worker_id, direction)`, applied AFTER the rename migration.
- **`runDebtEntryReasonMigration`** — idempotent add of `reason_category`, `reason_detail`, `payment_method`, `status`, `voided_at`, `voided_by`, `void_reason` columns on `debt_entry`. Backfill existing rows: `reason_category='INVOICE_DRIVEN'`, `status='LIVE'`.
- **Ordering**: rename → direction → reason migration. All three run inside `ensureDatabaseSchema` after the existing `runInvoiceDebtLinkageMigration`.

### API contract decisions

- **`counterpartyLedger.listParties`** — returns `{ items: PartyListItem[], nextCursor, totalCount, hasMore }`. Cursor-paginated like invoice list. Each item includes `partyType` (`WORKER | EXTERNAL_COUNTERPARTY`) so the UI can render appropriately.
- **`counterpartyLedger.getDetail`** — returns `PartyDetailView` (party + receivable + payable + net + entry history with voided status visible).
- **`counterpartyLedger.recordOpening`** — input: `{ partyId, partyType, reasonCategory, reasonDetail?, amount, referenceInvoiceId? }`. Permission: `debts.write`. Server derives direction from `reasonCategory`; rejects if `partyType=WORKER` AND `reasonCategory` is invoice-only.
- **`counterpartyLedger.recordPayment`** — input: `{ debtEntryId, amount, paymentMethod?, note? }`. Permission: `debts.write`. `paymentMethod` defaults to `CASH`. Validates amount ≤ outstanding balance on the OPENING.
- **`counterpartyLedger.consolidate`** — input: `{ payableEntryId, receivableEntryId }`. Permission: `debts.write`. Validates both entries belong to the same party and are of opposite directions.
- **`counterpartyLedger.voidEntry`** — input: `{ entryId, voidReason }`. Permission: `debts.write`. Server enforces: if entry is an OPENING, cascade-voids all live payments against it; each cascade void is recorded with `void_reason` referencing the OPENING id.
- **Sale invoice recording** — extend `invoicesCreate` to accept an optional `direction: 'PURCHASE' | 'SALE'` field, defaulting to `'PURCHASE'`. Sales go through the same `createInvoiceDebt` path with `direction='RECEIVABLE'` and `reasonCategory='INVOICE_DRIVEN'`.
- **Payment recording** — extend `invoicesMarkPaid` to accept `direction`. When paying a receivable invoice, the payment reduces the receivable account; when paying a payable, it reduces the payable account. `paymentMethod` defaults to `CASH`.
- **All endpoints use the existing RBAC system** (Issue #10) via `m.withPermission("debts.write", ...)` / `m.withPermission("debts.read", ...)`.
- **Workers don't sell to the company** — the API rejects `direction='SALE'` for parties of type `WORKER` at validation. Only `EXTERNAL_COUNTERPARTY` parties can have sale invoices.

### UI decisions

- **Color + label always paired**: green + "They owe us", red + "We owe them", gray + "Settled". Never color alone. Icon also reinforces (e.g. arrow pointing in vs out) — accessibility for color-blind users.
- **List view**: one row per party (worker + external mixed), columns: name, party type indicator, phone, net balance (absolute + colored + label), last activity date. Workers show their employee role; externals show their company name.
- **Detail view (party)**: three-line breakdown (Receivable / Payable / Net), then a tabbed history of entries (opening / payment / consolidation). Each entry row shows category badge, status (live/voided), amount, and a void button for live entries.
- **Worker debt tab** on the existing employee detail page: renders the same component as the external-counterparty detail page, scoped to that worker's `worker_id`. Adds a "New debt" button that opens the direct-debt wizard pre-loaded with the worker.
- **External Persons sidebar section**: top-level nav item `/external-persons` with list + create + detail pages.
- **RTL support**: all new components use logical CSS properties (`ps`, `pe`, `ms`, `me`, `start`, `end`). Arabic + English translations for every new string.
- **Debt creation wizard (3 steps, not 4)**: (1) party type (worker / external), (2) party selection with inline "+" create button using `?redirect=` query param, (3) category + amount + note. No separate direction step — direction is derived from the category and shown prominently as "We owe this worker" / "They owe us". Void button is in the entry-row action menu, opens a dialog requiring a non-empty void reason.
- **Cascade void warning**: when voiding an OPENING that has live payments, the dialog shows "This will also void N payments totaling X DZD. Are you sure?" with a confirm checkbox required to proceed.

### Decisions deferred (out of scope)

- **Multi-currency on receivable account**: same DZD-only constraint as payable today. Multi-currency is a separate future PRD.
- **Cross-party consolidation**: consolidating debts between DIFFERENT parties (e.g. triangular netting) is out of scope. Consolidation is per-party only.
- **Auto-consolidation on every payment**: not in scope. The user explicitly triggers consolidation; auto-net is future work.
- **Approval workflows for void**: simple `debts.write` permission only. Multi-step approvals are future work.
- **Bulk imports**: no CSV / Excel import of historical debts. Future work.
- **Auto-reconcile with payroll**: salary advances do NOT automatically reduce future payroll. The entrepreneur reconciles manually. Auto-reconciliation is future work.

---

## Testing Decisions

### What makes a good test

- Test through the module facade (`CounterpartyLedgerModule`), not through repos or ports directly.
- Test external behavior (input → observable output), not implementation (no spying on private methods, no asserting on SQL strings).
- One assertion per logical concern — a test fails for exactly one reason.
- Use real schema in the SQLite adapter (no Prisma mocking, no SQL string mocks).
- Use the in-memory adapter for module-level tests where state isolation matters more than SQL correctness.

### Module-level tests

- **`counterpartyLedger.module.test.ts`** covers: getNetBalance with zero/positive/negative net for both worker and external party types; getDetail with both-directions party; recordOpening happy path + reason-category validation + direction-derivation + cascade-void on failure; recordPayment happy path + over-payment rejection + zero-balance; consolidate happy path + same-direction rejection + cross-party rejection; voidEntry cascade on OPENING + cascade warning metadata; party-type validation (worker can't have sale invoice).

### Integration tests

- **`counterpartyLedger.port.test.ts`** (SQLite adapter) covers: migration idempotency (rename, direction, reason columns), backfill of existing rows to PAYABLE + INVOICE_DRIVEN + LIVE, uniqueness constraint on (party_id, direction), atomicity of multi-step writes via `runInTransaction`, cascade void as one transaction.

### Migration tests

- `runDebtAccountBalanceRenameMigration` exercised on fresh DB, pre-rename DB, and re-run (no-op).
- `runCounterpartyLedgerDirectionMigration` exercised on fresh DB, post-rename DB, and re-run (no-op).
- `runDebtEntryReasonMigration` exercised on fresh DB, post-direction DB, and re-run (no-op).

### UI tests

- Web: list view renders net balance as absolute + colored + labeled for each direction; mixed worker + external list renders both with party-type indicator; detail view renders three-line breakdown; worker debt tab on employee detail page mirrors counterparty detail page; void dialog shows cascade warning before confirming.

### Prior art

- The testing pattern mirrors `invoice.module.test.ts` exactly: real SQLite, real in-memory port, no mocking of repo internals.
- The migration test pattern mirrors `runInvoiceDebtLinkageMigration` tests from Issue #11.

### Coverage targets

- 100% statements, branches, functions, lines on every new and modified module. Enforced by CI.

---

## Out of Scope

- **Multi-currency on receivable account**: DZD only. Multi-currency is a separate future PRD.
- **Cross-party consolidation**: only same-party, opposite-direction consolidation is in scope.
- **Auto-consolidation**: user-triggered only.
- **Approval workflows for void or consolidation**: simple permission check only. Multi-step approvals are future work.
- **Bulk import of historical debts**: no CSV / Excel import. Future work.
- **Auto-reconcile with payroll**: salary advances do NOT auto-reduce future payroll. Future work.
- **Debt aging reports**: not in this PRD. Future reporting work.
- **Party merge / dedup tooling**: if two external persons are accidentally duplicates, the user can manually consolidate one into the other via existing close-against flow. Automatic dedup is future work.
- **Performance under 100k+ parties**: typical construction business has dozens to low hundreds of parties. Optimization is deferred to the Query Optimization slice (#14).
- **Mobile responsive overhaul**: components use the existing responsive patterns. A mobile-first pass is future work.
- **Debt forecasting / projections**: future work.
- **Audit log UI for the new endpoints**: audit data is captured in the DB (actorUserId, actorLabel, transactionId, void metadata), but a dedicated audit-log UI is not part of this PRD.

---

## Further Notes

### Implementation order

| Phase | Slice | Description | Rationale |
|---|---|---|---|
| **Phase A** | Rename migration | `runDebtAccountBalanceRenameMigration` | Pure refactor; unblocks every later phase |
| **Phase B** | Direction column migration | `runCounterpartyLedgerDirectionMigration` | Adds the data model; backfills existing rows |
| **Phase C** | Reason-category + payment-method + void columns migration | `runDebtEntryReasonMigration` | Captures the audit + reason model on existing entries |
| **Phase D** | `CounterpartyLedgerModule` + port + SQLite + in-memory + `voidEntry` cascade | Core backend | Enables the UX work |
| **Phase E** | Counterparty list + detail UI (read-side, both worker + external) | Surfacing the data | Depends on Phase D |
| **Phase F** | Direct-debt creation wizard + worker debt tab + inline external-person creation | Core workflow | Depends on Phase E |
| **Phase G** | Sale-invoice support (extend `invoicesCreate` + `invoicesMarkPaid` with direction) | Sales-side parallel to invoice flow | Depends on Phase D |
| **Phase H** | Inline payment recording on debt detail page (with payment-method + cascade-void) | Mutation flow | Depends on Phase E |
| **Phase I** | Debt consolidation (same party, opposite directions) | Advanced mutation | Depends on Phase H |
| **Phase J** | Hub improvements + overscroll fix | Polish | Can run in parallel with Phases H/I |

### Risk mitigation

**Risk: rename migration loses data on partial failure**
- Mitigation: wrap in `db.transaction()`; idempotent guard via `hasColumn`; tested on a copy of a real production-shaped database before merge.

**Risk: backfill assigns wrong direction to historical accounts**
- Mitigation: today every debt account is implicitly payable (no sales-invoice path exists). Backfill to PAYABLE preserves historical semantics. A pre-migration audit query counts rows to confirm.

**Risk: consolidation produces an inconsistent ledger on concurrent payment**
- Mitigation: `consolidate` runs inside `runInTransaction`; concurrent payments serialize through the same mutex.

**Risk: UI uses color alone for direction (accessibility failure)**
- Mitigation: code review explicitly checks for color+label pair; CI includes a lint rule that every `color: <color>` near a balance number is followed by an aria-label / visible label.

**Risk: scope creep into multi-currency or cross-counterparty netting**
- Mitigation: out-of-scope list is explicit in this PRD; deferred work is captured as separate future issues.

### Success criteria

- [ ] Rename migration applied to production database without data loss
- [ ] Direction column added with PAYABLE backfill
- [ ] Reason-category, payment-method, status, and void metadata columns added on `debt_entry`
- [ ] Existing `debt_entry` rows backfilled with `reason_category='INVOICE_DRIVEN'`, `status='LIVE'`
- [ ] `CounterpartyLedgerModule` + port + adapters implemented
- [ ] All 6 RPC endpoints (`listParties`, `getDetail`, `recordOpening`, `recordPayment`, `consolidate`, `voidEntry`) work end-to-end
- [ ] Void cascade auto-voids payments against an OPENING, with explicit UI warning
- [ ] Direct-debt wizard enforces reason category; derives direction from category; requires free-text detail for `OTHER`
- [ ] Sale-invoice support added to `invoicesCreate` and `invoicesMarkPaid`; rejects `SALE` for worker parties
- [ ] Payment method defaults to `CASH`; user can override to `BANK_TRANSFER` or `CHECK`
- [ ] Worker debt tab on employee detail page shows three-line breakdown
- [ ] External Persons sidebar section live with list + create + detail
- [ ] Unified parties list shows workers + externals with party-type indicator
- [ ] Hub page shows outstanding summary + top parties (by absolute net balance)
- [ ] Overscroll background fix shipped
- [ ] Color + label always paired in UI (verified by accessibility lint rule)
- [ ] Arabic + English translations for every new string
- [ ] RTL layout verified for every new component
- [ ] 100% test coverage on every new and modified module
- [ ] Full CI green (contracts build, typecheck, lint, API tests, web tests, build)
- [ ] Every Greptile review of this work lands at 5/5

### References

- Parent PRD: `plans/PRD-production-readiness.md`
- Predecessor feature list: `plans/002-debt-ux-overhaul/plan.md`
- Issue #11 (shipped): invoice management — establishes `runInTransaction`, `InvoiceDebtPort`, atomicity patterns
- Issue #21 (planned): rename `current_balance_dzd` → `current_balance`
- Issue #22 (planned): bidirectional party ledger data model + module + list/detail UI
- ADR-001: `docs/architecture-decisions.md` (needs update for direction + reason columns)
