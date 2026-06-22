# PRD: Bidirectional Counterparty Ledger & Debt UX Overhaul

**Status**: Ready for Agent
**Triage**: `ready-for-agent`
**Created**: 2026-06-22
**Parent PRD**: `PRD-production-readiness.md` (this PRD is a vertical extension of that effort)
**Predecessor plan**: `plans/002-debt-ux-overhaul/plan.md` (feature list — this PRD is the canonical version)

---

## Problem Statement

Today, every counterparty in Tuari has at most ONE debt account, and that account only models the **payable** side (money the entrepreneur owes the counterparty — supplier / vendor / lender cases). Three concrete user-visible gaps:

1. **A counterparty cannot owe the entrepreneur money.** If a supplier borrows tools from the entrepreneur's warehouse, or a customer pays in advance for a future project, the entrepreneur has no way to track that "they owe us" receivable. The current model forces the entrepreneur into ad-hoc notes or a separate spreadsheet.

2. **The net financial position of a counterparty is invisible.** When the same counterparty appears on both sides (e.g. they supplied us AND bought tools from us last month), the entrepreneur cannot see at a glance whether we still owe them, they still owe us, or everything is settled. They must mentally combine multiple debt-account balances and remember which sign convention applies.

3. **The debt UX is fragmented.** External persons are nested under `/debts/counterparties` rather than being a first-class entity. Creating a debt involves several clicks and an awkward redirect. There is no per-person "all debts" view, no inline payment processing, no way to consolidate (net) two debts against each other, and no consolidated hub that surfaces what's outstanding.

The entrepreneur cannot run a real construction business with bidirectional cash flow on these gaps. Customers expect to see "we still owe Mr X 12,500 DZD" or "Mr X owes us 7,300 DZD" in a glance, with a single click to drill into the breakdown.

---

## Solution

Introduce a **bidirectional counterparty ledger**: every counterparty gets up to two debt accounts (one PAYABLE, one RECEIVABLE), each tracked with the same balance-based sign convention. The data layer stays signed (clean math); the UI displays absolute values with color + explicit label so the user always sees "how much" without a leading minus sign.

On top of the new data model, deliver a complete **Debt UX overhaul**: external persons become a first-class sidebar section; debt creation becomes a streamlined wizard; per-person detail pages show the full breakdown (receivable / payable / net); payments can be recorded inline; debts can be consolidated; and the debts hub surfaces what needs attention.

Sign convention (locked in with the user):

| Account direction | OPENING event | PAYMENT event | Meaning of `+` balance |
|---|---|---|---|
| `PAYABLE` (we owe them) | `+amount` (we now owe more) | `-amount` (we now owe less) | we owe them (liability) |
| `RECEIVABLE` (they owe us) | `+amount` (they now owe more) | `-amount` (they now owe less) | they owe us (asset) |

**Net per counterparty** = `sum(receivable.current_balance) − sum(payable.current_balance)`

UI presentation:
- Display: `|net_balance|` as a positive number with currency
- Label + color (NEVER color alone — accessibility):
  - Green + "They owe us" → `net > 0`
  - Red + "We owe them" → `net < 0`
  - Gray + "Settled" → `net == 0`

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

### Cross-Cutting Stories

49. As an entrepreneur, I want all of the above to work on a fresh database and on an upgraded database, so that the deployment story is the same for everyone.
50. As an entrepreneur, I want 100% test coverage on every new and modified module, so that the next refactor is safe.
51. As an entrepreneur, I want the full CI pipeline to be green, so that the work is production-ready on day one.
52. As an entrepreneur, I want every Greptile review of this work to land at 5/5, so that no P0/P1 issues remain.

---

## Implementation Decisions

### Data model decisions

- **`direction` enum on `debt_account`**: `'PAYABLE' | 'RECEIVABLE'`, NOT NULL, defaults to `'PAYABLE'` for backfill. New column added via idempotent migration (guarded by `hasColumn`).
- **Uniqueness**: `(external_counterparty_id, direction)` is unique. A counterparty may have at most one of each direction. For internal workers, `(worker_id, direction)` follows the same rule.
- **Backfill**: existing rows get `direction='PAYABLE'`. This preserves historical semantics (today's single account per counterparty is always payable).
- **Sign convention is balance-based, not cash-flow-based**: see Solution section. Documented in a `ledger-direction.ts` constants module so every callsite uses named constants instead of magic strings.

### Module architecture decisions

- **`CounterpartyLedgerModule`** — new module under `apps/api/src/modules/counterparty/`. Public interface: `getNetBalance(counterpartyId)`, `getDetail(counterpartyId)`, `recordOpening(input)`, `recordPayment(input)`, `consolidate(input)`. Same shape as today's `InvoiceModule` (deep implementation, port-driven).
- **`CounterpartyLedgerPort`** — port interface. Methods take a `direction` argument (or a discriminated union). Adapters: `SqliteCounterpartyLedgerPort` and `InMemoryCounterpartyLedgerPort`.
- **Reuse `runInTransaction<T>`** — established in #11. All multi-step writes (create opening + update balance, record payment + reduce balance, consolidate + record entries) wrap the port call in `repo.runInTransaction`.
- **Reuse `InvoiceDebtPort` where possible** — extend it with a `direction` argument on `createInvoiceDebt` and `recordInvoicePayment` rather than splitting into two ports. Splitting would duplicate atomicity logic.

### Schema migration decisions

- **`runDebtAccountBalanceRenameMigration`** — idempotent rename of `current_balance_dzd` → `current_balance` via `ALTER TABLE ... RENAME COLUMN`, guarded by `hasColumn` check, wrapped in a transaction, recorded in `app_schema_state`.
- **`runCounterpartyLedgerDirectionMigration`** — idempotent add of `direction` column + backfill + uniqueness constraint, applied AFTER the rename migration.
- **Ordering**: rename migration → direction migration → any code that reads the new columns. Both migrations run inside `ensureDatabaseSchema` after the existing `runInvoiceDebtLinkageMigration`.

### API contract decisions

- **`counterpartyLedger.list`** — returns `{ items: CounterpartyListItem[], nextCursor, totalCount, hasMore }`. Cursor-paginated like invoice list.
- **`counterpartyLedger.detail`** — returns `CounterpartyDetailView` (counterparty + receivable + payable + net + entry history).
- **`counterpartyLedger.createOpening`** — input: `{ counterpartyId, direction, amount, note?, invoiceId? }`. Permission: `debts.write`.
- **`counterpartyLedger.recordPayment`** — input: `{ counterpartyId, direction, amount, note? }`. Permission: `debts.write`. Validates amount ≤ outstanding.
- **`counterpartyLedger.consolidate`** — input: `{ payableDebtEntryId, receivableDebtEntryId }`. Permission: `debts.write`. Validates both entries belong to the same counterparty and are of opposite directions.
- **All endpoints use the existing RBAC system** (Issue #10) via `m.withPermission("debts.write", ...)` / `m.withPermission("debts.read", ...)`.
- **Sale invoice recording** — extend `invoicesCreate` to accept an optional `direction: 'PURCHASE' | 'SALE'` field, defaulting to `'PURCHASE'`. Sales go through the same `createInvoiceDebt` path with `direction='RECEIVABLE'`.
- **Payment recording** — extend `invoicesMarkPaid` to accept `direction`. When paying a receivable invoice, the payment reduces the receivable account; when paying a payable, it reduces the payable account.

### UI decisions

- **Color + label always paired**: green + "They owe us", red + "We owe them", gray + "Settled". Never color alone. Icon also reinforces (e.g. arrow pointing in vs out) — accessibility for color-blind users.
- **List view**: one row per counterparty, columns: name, phone, net balance (absolute + colored + label), last activity date.
- **Detail view**: three-line breakdown (Receivable / Payable / Net), then a tabbed history of entries (opening / payment / consolidation).
- **RTL support**: all new components use logical CSS properties (`ps`, `pe`, `ms`, `me`, `start`, `end`). Arabic + English translations for every new string.
- **Debt creation wizard**: 4 steps (party type → party selection → amount & direction → note). Inline "+" button for creating a new external person uses `?redirect=` query param to return to the wizard with the new person pre-selected.

### Decisions deferred (out of scope)

- **Multi-currency on receivable account**: same DZD-only constraint as payable today. Multi-currency is a separate future PRD.
- **Cross-counterparty consolidation**: consolidating debts between DIFFERENT counterparties (e.g. triangular netting) is out of scope. Consolidation is per-counterparty only.
- **Auto-consolidation on every payment**: not in scope. The user explicitly triggers consolidation; auto-net is future work.

---

## Testing Decisions

### What makes a good test

- Test through the module facade (`CounterpartyLedgerModule`), not through repos or ports directly.
- Test external behavior (input → observable output), not implementation (no spying on private methods, no asserting on SQL strings).
- One assertion per logical concern — a test fails for exactly one reason.
- Use real schema in the SQLite adapter (no Prisma mocking, no SQL string mocks).
- Use the in-memory adapter for module-level tests where state isolation matters more than SQL correctness.

### Module-level tests

- **`counterpartyLedger.module.test.ts`** covers: getNetBalance with zero/positive/negative net; getDetail with both-directions counterparty; recordOpening happy path + atomicity on failure; recordPayment happy path + over-payment rejection + zero-balance; consolidate happy path + same-direction rejection + cross-counterparty rejection; concurrent recordPayment serialization.

### Integration tests

- **`counterpartyLedger.port.test.ts`** (SQLite adapter) covers: migration idempotency, backfill of existing rows to PAYABLE, uniqueness constraint on (counterparty_id, direction), atomicity of multi-step writes via `runInTransaction`.

### Migration tests

- `runDebtAccountBalanceRenameMigration` is exercised on fresh DB, pre-rename DB, and re-run (no-op).
- `runCounterpartyLedgerDirectionMigration` is exercised on fresh DB, post-rename DB, and re-run (no-op).

### UI tests

- Web: list view renders net balance as absolute + colored + labeled for each direction. Detail view renders three-line breakdown. Color is paired with label/icon, never alone.

### Prior art

- The testing pattern mirrors `invoice.module.test.ts` exactly: real SQLite, real in-memory port, no mocking of repo internals.
- The migration test pattern mirrors `runInvoiceDebtLinkageMigration` tests from Issue #11.

### Coverage targets

- 100% statements, branches, functions, lines on every new and modified module. Enforced by CI.

---

## Out of Scope

- **Multi-currency on receivable account**: DZD only. Multi-currency is a separate future PRD.
- **Cross-counterparty consolidation**: only same-counterparty, opposite-direction consolidation is in scope.
- **Auto-consolidation**: user-triggered only.
- **Approval workflows for consolidation**: simple permission check only. Multi-step approvals are future work.
- **Debt aging reports**: not in this PRD. Future reporting work.
- **Counterparty merge / dedup tooling**: if two external persons are accidentally duplicates, the user can manually consolidate one into the other via existing close-against flow. Automatic dedup is future work.
- **Performance under 100k+ counterparties**: typical construction business has dozens to low hundreds of counterparties. Optimization is deferred to the Query Optimization slice (#14).
- **Mobile responsive overhaul**: components use the existing responsive patterns. A mobile-first pass is future work.
- **Debt forecasting / projections**: future work.
- **Audit log UI for the new endpoints**: audit data is captured in the DB (actorUserId, actorLabel, transactionId), but a dedicated audit-log UI is not part of this PRD.

---

## Further Notes

### Implementation order

| Phase | Slice | Description | Rationale |
|---|---|---|---|
| **Phase A** | Rename migration | `runDebtAccountBalanceRenameMigration` | Pure refactor; unblocks every later phase |
| **Phase B** | Direction column migration | `runCounterpartyLedgerDirectionMigration` | Adds the data model; backfills existing rows |
| **Phase C** | `CounterpartyLedgerModule` + port + SQLite + in-memory | Core backend | Enables the UX work |
| **Phase D** | External Persons sidebar (F1) | Structural UI | Other UX features depend on these routes |
| **Phase E** | Debt creation wizard (F2) | Core workflow | Depends on Phase D routes |
| **Phase F** | Per-person detail view (F3) | Shows bidirectional data | Depends on Phase C |
| **Phase G** | Inline payment processing (F4) | Core action | Depends on Phase F |
| **Phase H** | Debt consolidation (F5) | Advanced | Depends on Phase G |
| **Phase I** | Hub improvements (F6) | Polish | Depends on all above |
| **Phase J** | Overscroll fix (F7) | Quick CSS | Can run in parallel with any phase |

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
- [ ] `CounterpartyLedgerModule` + port + adapters implemented
- [ ] All 5 RPC endpoints (`list`, `detail`, `createOpening`, `recordPayment`, `consolidate`) work end-to-end
- [ ] External Persons sidebar section live
- [ ] Debt creation wizard ships with 4 steps + inline person creation + redirect-back
- [ ] Per-person detail view shows three-line breakdown (Receivable / Payable / Net)
- [ ] Payment processing inline on debt detail page
- [ ] Consolidation works for same-counterparty, opposite-direction debts
- [ ] Hub page shows outstanding summary + top counterparties
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
- Issue #22 (planned): bidirectional counterparty ledger data model
- ADR-001: `docs/architecture-decisions.md` (needs update for direction column)
