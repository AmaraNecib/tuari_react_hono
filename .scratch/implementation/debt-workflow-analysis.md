# Debt workflow — what is actually built (scout analysis)

Owner item 14: "the debt workflow is unclear and may be incomplete."
Lane: `issue-debt-scout`, read-only. Base: `origin/develop` @ `22495413`.
No product code changed. No runtime probe was run: this worktree has no
`node_modules` (only the primary checkout does), so the API/web suites could
not execute here. Every claim below is a source reading with `file:line`;
the sign claims are derived from the exact helpers the runtime calls.

---

## 0. Executive summary

The debt domain is a signed per-party ledger with a `direction`
(`PAYABLE`/`RECEIVABLE`) that decides how a positive balance is read. The
*read* side (summary, labels, reports) is coherent and well tested.

The *write* side is not. Four independent writers (direct-debt page, invoice
module, inventory purchase flow, outbound-transfer flow) disagree about what a
positive number means, and the main user-facing writer does not send the
`direction` field at all. Net effect: for the most common case — a salary
advance, i.e. "we owe the worker" — the ledger stores the opposite direction
and the debts hub shows the worker as owing us. A purchase invoice does the
same to a supplier, and a later payment against that invoice moves the debt
balance away from zero.

Separately, the promised purchase → warehouse + debt workflow exists
(`/invoices/create`) but its debt is invisible from the debt side and the
invoice↔debt link is never written for inventory purchases. A second, unused
API-only invoice module implements the correct sign and the invoice link, but
no UI calls it.

---

## 1. The model as built

### 1.1 Tables

| Table | File | Notes |
|---|---|---|
| `external_counterparty` | `apps/api/src/schema/company.ts:228` | id, fullName, phoneNumber, note, audit |
| `debt_account` | `apps/api/src/schema/company.ts:238` | DDL `apps/api/src/infrastructure/database/schema-definitions.ts:269` |
| `debt_entry` | `apps/api/src/schema/company.ts:262` | DDL `schema-definitions.ts:291` |

`debt_account` columns: `id`, `party_type` (`INTERNAL_WORKER` /
`EXTERNAL_COUNTERPARTY`), `worker_id` (FK employee), `external_counterparty_id`
(FK), `status` (`OPEN`/`SETTLED`), `direction` (`PAYABLE`/`RECEIVABLE`,
default `PAYABLE`), `current_balance` (REAL, signed), `note`, `settled_at`,
audit columns. A CHECK enforces exactly one of `worker_id` /
`external_counterparty_id` (`schema-definitions.ts:288`).

`debt_entry` columns: `id`, `debt_account_id` (FK), `invoice_id` (FK to
`invoice`, `schema-definitions.ts:315` — **not** to
`inventory_invoice_group`), `entry_type` (`OPENING`/`PAYMENT`/`ADJUSTMENT`/
`SETTLEMENT`/`ADVANCE`), `currency` (default DZD), `signed_amount`,
`entry_date`, `note`, `balance_after`, `reason_category`, `reason_detail`,
`payment_method`, `status` (`LIVE`/`VOIDED`), `voided_at`/`voided_by`/
`void_reason`, audit columns.

Unique index: `debt_account_external_counterparty_direction_unique`
(`apps/api/src/infrastructure/database/schema.ts:1352`) — one account per
(external counterparty, direction). **There is no equivalent worker+direction
index, and no `getDebtAccountByWorkerIdAndDirection` lookup** — see §4.2.

### 1.2 Contracts

`packages/contracts/src/debts.ts`:
`externalCounterpartySchema:22`, `debtAccountSchema:31`, `debtEntrySchema:48`,
`debtPartyDetailSchema:84`, `debtsSummarySchema:111`,
`debtAccountCreateInputSchema:137`, `debtEntryCreateInputSchema:179`,
`debtEntryRecordPaymentInputSchema:189`, `debtEntryVoidInputSchema:196`,
`debtConsolidationInputSchema:201`, `directDebtEntryCreateInputSchema:210`,
`debtSettlementInputSchema:258`, `employeeDebtEntryCreateInputSchema:299`.

Enums live in `packages/contracts/src/core.ts:97-135`. The
reason→direction map and `deriveDirectionFromCategory` are at
`core.ts:136-165`.

RPC surface: `packages/contracts/src/debts-contract.ts`; handlers
`apps/api/src/rpc/handlers/finance.ts`.

### 1.3 What each field actually does (not what the name suggests)

| Field | What it really does |
|---|---|
| `debt_account.direction` | Selects the sign convention on read. **It is never derived from `reasonCategory`** and never inferred from the sign of `openingBalanceDzd`. It is `input.direction ?? "PAYABLE"` (`finance.service.ts:255`). `deriveDirectionFromCategory` (`core.ts:152`) is exported but called nowhere in production code. |
| `debt_account.current_balance` | Signed running sum of LIVE `debt_entry.signed_amount`. Can legitimately be negative on a `PAYABLE` account (test pins this: `company.service.test.ts:1191-1212`). |
| `debt_account.status` | Purely derived: `balance === 0 ? "SETTLED" : "OPEN"` (`company.helpers.ts:51`). It is not a user-set lifecycle. |
| `debt_entry.entry_type` | `SETTLEMENT` is written only by `settleDebtAccount` (`finance.service.ts:496`); the web never sends it. The ledger's free-form "تسجيل الدفعة" button sends `ADJUSTMENT` (`workspace-mutations.ts:706`). |
| `debt_entry.reason_category` | Defaults to `INVOICE_DRIVEN` for **every** entry when omitted (`finance.service.ts:241,279,313`) — including worker direct debts, which the PRD restricts to non-invoice categories. |
| `debt_entry.invoice_id` | Written only by the API-only `invoice` module (`invoice-debt.port.ts:114-127`). The inventory purchase flow never sets it, and the contract output (`debtEntrySchema`) does not expose it, so no UI can read it. |
| `debt_entry.status`/void fields | Live/voided with audit; void of an `OPENING` cascades to live payments (`finance.service.ts:422`). |
| `payment_method` | Only set by `recordDebtPayment` (default `CASH`) and `invoice-debt.port`; the free-form entry and `createEmployeeDebtEntry` never set it. |

Sign convention (single source of truth, `packages/contracts/src/debt-helpers.ts:24`):
`getDebtAccountNetContribution` returns `+balance` for `RECEIVABLE` and
`-balance` for `PAYABLE`. So **`PAYABLE` + positive = we owe them**;
**`RECEIVABLE` + positive = they owe us**. Party net =
`getNetDebtBalance` = sum of contributions.

### 1.4 Service operations (`apps/api/src/modules/company/finance.service.ts`)

| Op | Line | Writes |
|---|---|---|
| `createExternalCounterparty` | 143 | counterparty |
| `createDebtAccount` | 181 | account (+ `OPENING`, or `ADJUSTMENT` if the account already exists) |
| `createDebtEntry` | 295 | entry, re-stamps account balance/status |
| `recordDebtPayment` | 353 | `PAYMENT` (only against a LIVE `OPENING`, only downward) |
| `voidDebtEntry` | 422 | `VOIDED` + cascade + balance recompute |
| `settleDebtAccount` | 496 | `SETTLEMENT` to zero |
| `consolidateDebtEntries` | 540 | voids two openings, writes remainder |
| `getDebtPartyDetail` | 720 | read |
| `listDebtsSummary` | 760 | read |
| `generateDebtReport` | 874 | read (DEBT report) |
| `getEmployeeDebtAccount` | 79 | read (first account for worker) |
| `createEmployeeDebtEntry` | 85 | auto-creates worker account, then `createDebtEntry` |

The DEBT report (`finance.service.ts:874-1050`) is a real aggregation:
gross outstanding (both directions, non-negative), aging buckets with
"overdue" operationally defined as OPEN ≥ 60 days, top debtors. It does not
net directions, by design.

---

## 2. The flows as built

### A. Direct debt — `/debts/create` (`DebtCreatePage`, `debt-create-page.tsx`)

Steps today:
1. Pick party type (worker / external) — `debt-create-page.tsx:205-250`.
2. Pick the party (with inline create) — `:252-305`.
3. Pick a reason category card (hard-coded Arabic labels, `:19-101`, `:307-340`).
4. Direction is shown as a derived label; a manual toggle appears only for
   categories with `UNCONSTRAINED` direction (`:139-160`, `:342-370`).
   `INVOICE_DRIVEN` is **not** in the category list, so the only manual case
   is `OTHER`.
5. Enter amount + date + note; `OTHER` requires a detail (`:373-410`).
6. Submit (`handleCreateDebt`, `:163-190`): sends
   `openingBalanceDzd: resolvedDirection === "owed-to-us" ? +amount : -amount`
   and **no `direction` field**. Ends by navigating to the worker debts tab
   or the external detail page (`:182-187`).

Where it ends: the party detail page ledger. The account it created was
always `PAYABLE` and its label is inverted (§4.1).

### B. "Record payment" on a party page (`DebtCasesPanel`, `debt-cases-panel.tsx`)

Steps: type a signed amount + note on the party card, press
"تسجيل الدفعة" (`:163-188`). This calls `debtAccountsCreate` with
`openingBalanceDzd: openingBalanceValue` (raw sign the user typed) and no
`direction`. On an existing account the service writes an **`ADJUSTMENT`**
(`finance.service.ts:236-243`), not a `PAYMENT`. Ends with the ledger
refreshed. The button label says payment; the entry type says adjustment.

### C. Free-form ledger entry (`DebtLedgerPanel`, `debt-ledger-panel.tsx`)

Steps: date + signed amount + note, press "تسجيل الدفعة" (`:100-124`). The
hook hard-codes `entryType: "ADJUSTMENT"` (`workspace-mutations.ts:706`) and
does not capture a payment method. The helper text asks the user to reason
about signs ("أدخل مبلغًا موجبًا إذا زاد ما لنا…").

### D. Per-opening payment (`DebtLedgerPanel` → `RecordEntryPaymentDialog`)

Only rendered for a LIVE `OPENING` row (`debt-ledger-panel.tsx:222-231`).
Captures amount + method + note and calls `debtEntriesRecordPayment`
(`record-entry-payment-dialog.tsx:60-70`). This is the only path that
captures a payment method.

### E. Settle to zero (`DebtLedgerPanel` → `debtAccountsSettle`)

`debt-ledger-panel.tsx:143-155`; service writes a `SETTLEMENT` entry equal to
`-currentBalance` and sets status `SETTLED` (`finance.service.ts:496-538`).

### F. Consolidation (`ConsolidationDialog`)

Only offered when the party has both a PAYABLE and a RECEIVABLE account
(`debt-cases-panel.tsx:78-86`). For workers this is effectively unreachable
(§4.2).

### G. Void (`VoidEntryDialog`)

Requires a reason; warns and requires a checkbox before cascading an
`OPENING` void (`void-entry-dialog.tsx:56-134`).

### H. Employee debt tab (`EmployeeDebtPanel`, `employee-debt-panel.tsx`)

Steps: choose entry type (`OPENING`/`PAYMENT`/`ADJUSTMENT`/`ADVANCE`), date,
amount, note. Calls `employeeDebtEntryCreate` →
`financeService.createEmployeeDebtEntry`, which always passes
`signedAmountDzd: input.amountDzd` (positive, `finance.service.ts:115`).
Two consequences: `PAYMENT` **increases** the balance, and the default
`OPENING` is rejected once the account already has an entry
(`finance.service.ts:303-312`).

### I. Purchase invoice → warehouse + debt (`InventoryInvoiceCreatePage`, `/invoices/create`)

Steps: invoice number/date, expand "الدين والدفع" → `هل هذه دين؟ = نعم` →
payment method + paid-now, expand "ربط بجهة خارجية" → external counterparty,
expand "المستودع والمشروع الافتراضي" → warehouse, add lines, save
(`inventory-invoice-create-page.tsx:317-620`). The contract requires a
counterparty when `createDebt` is on (`inventory.ts:342-344`), so the
silent no-debt case is closed at the wire.

Server (`inventory.service.ts:392-458`): computes `remainingDebtDzd`, then
inside one transaction creates the debt account with
`openingBalanceDzd: -grossTotalDzd` (`:422`) and, if a first payment was
entered, a `PAYMENT` with `signedAmountDzd: paidAmountDzd` (`:433-434`), then
creates the invoice group with `debtAccountId`. Stock/asset units and
`PURCHASE` movements are created in the same transaction, so the
"add to warehouse" half works.

Ends on the invoice detail page, which shows `remainingDebtDzd` and a
"تسجيل دفعة" button (`inventory-invoice-details-page.tsx:73-80`) but no link
to the debt account, party or hub.

### J. Invoice payment (`recordInvoicePayment`, `inventory.service.ts:862-905`)

Writes a `PAYMENT` with `signedAmountDzd: -amountToRecord` (`:893`) and
updates `paidAmountDzd`/`remainingDebtDzd`. Note the sign is the **opposite**
of the creation-time payment in flow I.

### K. Outbound sale → debt (`OutboundTransferCreatePageV2`)

Collects payment type (CASH/DEBT), first payment amount/percent, items. Sends
only `debtAmountDzd: remainingDebt` (`outbound-transfer-create-page-v2.tsx:134`);
the first payment is computed (`:36-62`) but never sent. Server creates the
account with `openingBalanceDzd: input.debtAmountDzd` (positive) and default
`PAYABLE` (`inventory.service.ts:929-940`), even for `transferType: "SALE"`.

### L. API-only invoice module (`apps/api/src/modules/invoice/`)

`invoicesCreate` (DRAFT) → `invoicesReceive` → `createInvoiceDebt`
(OPENING `+total` on `PAYABLE` for PURCHASE, `RECEIVABLE` for SALE;
`invoice-debt.port.ts:197-246`) → `invoicesMarkPaid` (`PAYMENT -amount`,
`:256-300`). This is the only writer that both signs correctly and backfills
`debt_entry.invoice_id`. **No web code calls any `invoices*` RPC** (grep of
`apps/web/src` for `rpcClient.invoices` is empty), so this path has no UI.

---

## 3. The relationships

| Relationship | Schema link | Used by code | Displayed |
|---|---|---|---|
| debt ↔ external party | `debt_account.external_counterparty_id` FK (`company.ts:243`) | yes, everywhere | yes (hub, party detail, ledger) |
| debt ↔ worker | `debt_account.worker_id` FK (`company.ts:239`) | yes | yes (employee debts tab) |
| debt ↔ invoice | `debt_entry.invoice_id` (no Drizzle FK; DDL FK → `invoice`, `schema-definitions.ts:315`) | **only** the API-only invoice module (`invoice-debt.port.ts:114-127`). Inventory purchases never set it. | **no** — not in `debtEntrySchema`, no UI |
| invoice ↔ debt (reverse) | `invoice.debt_account_id` (`schema/invoice.ts:29`), `inventory_invoice_group.debt_account_id` (`schema/inventory.ts:45`) | yes | invoice detail shows `remainingDebtDzd`, not the account/party |
| debt ↔ purchase | via `inventory_invoice_group.debt_account_id` | yes, at creation (`inventory.service.ts:448-458`) | no (debt UI shows nothing about the invoice) |
| debt ↔ project | **no link exists** on `debt_account`/`debt_entry` | — | — |
| debt ↔ warehouse | **no link exists** on `debt_account`/`debt_entry` | — | — |
| project cost ↔ asset placement | `inventory_asset_charge.project_id` (`asset-charge.service.ts`) | yes | asset charge history; **not a debt** |

So: a debt knows its party. It does not know its project or warehouse. It can
know its invoice only through the API-only module, and that knowledge is never
returned to a client.

---

## 4. Gaps and contradictions

### 4.1 Direct-debt direction is inverted (highest impact)

`debt-create-page.tsx:166-175` encodes direction in the sign and never sends
`direction`; `workspace-mutations.ts:669` defaults it to `PAYABLE`.

Worked example, salary advance (we owe the worker 5 000):
- UI shows "علينا له" (`resolvedDirection = "owed-by-us"`, `:145`).
- Sends `openingBalanceDzd: -5000`, no `direction`.
- Stored: `direction = PAYABLE`, `currentBalance = -5000`.
- `listDebtsSummary` (`finance.service.ts:831`) adds
  `getDebtAccountNetContribution({currentBalance:-5000, direction:"PAYABLE"})`
  = `+5000`.
- Hub label `getDebtBalanceLabel(+5000)` = "لنا عنده" — **the worker now
  appears to owe us**.

The reverse selection ("لنا عنده") produces "علينا له". The codebase's own
test pins the convention that makes this wrong (`company.service.test.ts:1191-1212`
asserts PAYABLE `-500` → "لنا عنده"). Same inversion applies to every category
card (SALARY_ADVANCE, REIMBURSEMENT, CASH_TAKE, …) and to `DebtCasesPanel`
flow B.

### 4.2 Worker receivable accounts are unreachable

`createDebtAccount` looks up an existing worker account with
`getDebtAccountByWorkerId` (`finance.service.ts:216`), which ignores direction
(`sqlite-company.repository.ts:556`). There is no worker+direction unique
index or lookup. So a worker can only ever have one account, and the web never
sends `direction`, so it is always PAYABLE. The worker categories that are
RECEIVABLE by design (`CASH_TAKE`, `EQUIPMENT_DAMAGE`, `PERSONAL_LOAN`,
`core.ts:141-146`) cannot create a receivable account; they write a negative
PAYABLE balance instead. Worker consolidation (flow F) is therefore dead.

### 4.3 The reason→direction lock is not enforced

`deriveDirectionFromCategory` (`core.ts:152`) is never called in production.
The contract's `debtAccountCreateInputSchema` accepts any `direction` with any
`reasonCategory` (`debts.ts:137-177`), and the service ignores the category.
The create page tells the user "الاتجاه محدد حسب نوع السبب"
(`detailPages.debt.directionDerived`), which is not true at the API.

### 4.4 Inventory purchase debt: sign inverted, and its own payments move the wrong way

Creation (`inventory.service.ts:422`): `openingBalanceDzd = -grossTotalDzd`
with default `PAYABLE`. For a 1 000 invoice, balance `-1000` → net `+1000` →
hub says the supplier owes us.

Then the two payment paths disagree:
- creation-time first payment `signedAmountDzd: +paidAmount` (`:434`);
- later `recordInvoicePayment` `signedAmountDzd: -amount` (`:893`).

Concrete: 1 000 gross, 400 paid at creation → account `-1000 + 400 = -600`,
`remainingDebtDzd = 600`. Pay the remaining 600 via the invoice page →
account `-600 - 600 = -1200`, `remainingDebtDzd = 0`. The invoice is paid but
the ledger says the supplier owes us 1 200. The `invoice` module
(`invoice-debt.port.ts:214,268`) uses the correct opposite signs for the same
business event.

### 4.5 Outbound sale debt has the wrong direction

`createOutboundTransfer` (`inventory.service.ts:929-940`) writes a positive
opening on the default `PAYABLE` for a `SALE`. A sale means they owe us →
should be `RECEIVABLE`. As built the hub shows "علينا له" for a sale.

### 4.6 Employee panel: PAYMENT adds, and the default entry type fails

`signedAmountDzd: input.amountDzd` is always positive (`finance.service.ts:115`),
so selecting `PAYMENT` increases the balance. The default `OPENING`
(`employee-debt-panel.tsx:23`) is rejected by `createDebtEntry` after the
first entry (`finance.service.ts:303-312`).

### 4.7 Three different "record payment" semantics

| UI label | Endpoint | Entry written |
|---|---|---|
| Party card "تسجيل الدفعة" | `debtAccountsCreate` | `ADJUSTMENT` (or `OPENING`) |
| Ledger "تسجيل الدفعة" | `debtEntriesCreate` | `ADJUSTMENT` |
| Ledger row "دفعة" | `debtEntriesRecordPayment` | `PAYMENT` + method |
| Employee tab "PAYMENT" | `employeeDebtEntryCreate` | `PAYMENT` with **positive** amount |

`recordDebtPayment` also refuses anything but a LIVE `OPENING`
(`finance.service.ts:374-376`), so a debt created as an `ADJUSTMENT` can never
be paid through the payment endpoint.

### 4.8 The invoice ↔ debt link is invisible and, for purchases, absent

- `debt_entry.invoice_id` is not in `debtEntrySchema`, so the API never returns it.
- The inventory purchase flow never writes it (it only puts the invoice number
  in the note text, `inventory.service.ts:423-435`).
- Its DDL FK targets the unused `invoice` table, not `inventory_invoice_group`.
- The invoice detail page shows `remainingDebtDzd` but no link to the ledger,
  and the debt pages show no invoice. The two halves of the purchase workflow
  cannot be reconciled from either screen.

### 4.9 Collected-but-dropped input

The outbound transfer page computes `firstPaymentAmount` and renders the
first-payment controls (`outbound-transfer-create-page-v2.tsx:36-54`,
`:270-303`) but sends only `debtAmountDzd: remainingDebt` (`:134`). The API has
no first-payment field. The first payment is silently discarded.

### 4.10 Dead code that looks live

- `directDebtEntryCreateInputSchema` (`debts.ts:210`) has no contract
  operation; the only consumer is `packages/contracts/src/index.test.ts`.
- `RecordPaymentDialog` (`record-payment-dialog.tsx`) is imported only by
  `date-picker-screens.test.tsx`; production uses `RecordEntryPaymentDialog`.
- The whole `invoice` module is wired into `appContract` and the router but
  has no web caller.

### 4.11 Label/validation/localization gaps

- `debt-create-page.tsx` hard-codes category `labelAr`/`descriptionAr`
  (`:19-101`) and never uses `labelEn`/`descriptionEn`; it also hard-codes
  several section labels.
- The submit button is disabled with no message when the party is missing or
  the amount is ≤ 0 (`:411`). The `OTHER` detail requirement is only a
  disabled button.
- `DebtsHubPage`, `DebtLedgerPanel`, `DebtCasesPanel`, `VoidEntryDialog` and
  the invoice detail page contain many hard-coded Arabic strings.
- `record-payment-dialog.tsx:46` labels the account balance with the
  direction-agnostic `getDebtBalanceMeta(balance)`, so a positive PAYABLE
  balance reads "لنا عنده"; `debt-ledger-panel.tsx` correctly uses
  `getDebtAccountBalanceMeta`. The dialog is dead, but the pattern is the bug
  class.
- Contract validation messages for `directDebtEntryCreateInputSchema` are
  Arabic but unreachable (no endpoint). The API messages that *are* reachable
  are Arabic and fine.
- No test covers `createDebt: true` for `createInvoiceGroup` (grep of
  `apps/api/src` tests for `createDebt: true` is empty), which is why §4.4 is
  not caught.

### 4.12 Doc/PRD drift

`plans/PRD-bidirectional-counterparty-ledger.md` locks the convention
(PAYABLE OPENING `+amount`), the per-category direction lock, and up-to-two
accounts per worker. The implementation violates all three for the direct-debt
and purchase paths. `debts-hub-page.tsx:115` also tells the user there is
"حساب دين واحد لكل عامل أو طرف خارجي" (one account per party), contradicting
the PRD and the external counterparty's two-account model.

---

## 5. Proposed decisions (owner must choose; do not implement blind)

**D1 — Is the PRD sign convention still the law?**
Options: (a) yes, fix the writers to `+amount` on the right direction;
(b) no, redefine `currentBalance` sign as the net and drop `direction` from
read paths. Recommendation: (a). The read side, reports, tests and the invoice
module already implement (a); changing the read side is a much larger blast
radius. Needs an explicit owner confirmation before any fix.

**D2 — Direct-debt writer: send `direction` or derive it from the category?**
Options: (a) web sends `direction` computed from the category, API keeps
validating; (b) API derives direction from `reasonCategory` and rejects a
mismatch (PRD behaviour). Recommendation: (b) plus a contract-level
superRefine, so every writer (web, inventory, future imports) is forced
correct. Then make `direction` non-optional for direct debts.

**D3 — Worker receivable accounts: allow or drop?**
Options: (a) add worker+direction uniqueness and a direction-aware lookup so
workers get two accounts (PRD); (b) declare one worker account and express
receivables as a negative PAYABLE balance, and remove the misleading
RECEIVABLE categories/consolidation UI for workers. Recommendation: (a) if the
owner wants the PRD's bidirectional worker ledger; otherwise (b) and delete
the dead consolidation path.

**D4 — Inventory purchase debt: which sign, and does the invoice own the
truth?** Recommendation: `OPENING +gross` on PAYABLE, `PAYMENT -paid`, so
`currentBalance === remainingDebtDzd`; make `recordInvoicePayment` post
`PAYMENT -amount` consistently. Add the missing `createDebt: true` tests.

**D5 — Where does the invoice↔debt link live?** Options: (a) keep
`inventory_invoice_group.debt_account_id` as the only link and expose it in
the debt API/UI; (b) also backfill `debt_entry.invoice_id` and re-point its FK
at the table that is actually used; (c) merge the two invoice modules.
Recommendation: decide whether the API-only `invoice` module is being kept. If
not, (a) + expose the invoice on the debt party detail; if yes, (b) + give it
a UI. Do not keep two invoice tables silently.

**D6 — Debt ↔ project / warehouse.** The PRD has no debt↔project link, but
the owner asked. Options: (a) leave as-is (invoice/charge carry the project);
(b) add optional `project_id`/`warehouse_id` to the debt or entry and surface
them. Recommendation: (a) for now, but document that purchase debts inherit
project/warehouse through the invoice only, and show that context on the debt
detail so the operator can answer "what was this debt for?".

**D7 — Payment entry-type semantics.** Recommendation: one payment endpoint
(`recordDebtPayment`), allow it on any LIVE entry (not just `OPENING`), and
stop labelling `ADJUSTMENT` writes as payments. Fix `createEmployeeDebtEntry`
to sign by entry type.

**D8 — Outbound transfer first payment.** Options: (a) implement it in the API
(create the debt with `opening = -(remaining)` and a `PAYMENT +first`), or
(b) remove the control. Recommendation: (a) if the flow is meant to support
partial payment at transfer time; otherwise (b) — do not keep a control that
silently drops input.

**D9 — Labels/localization pass.** Recommendation: route every debt string
through `ar.ts` (including the category cards, using the existing
`labelAr`/`labelEn` fields), add inline validation messages for the disabled
submit paths, and add helper text that states the sign convention once per
screen instead of relying on the user to infer it.

---

## 6. Evidence

Commands run (all read-only):

```
git log --oneline -3
git status --short
grep -ril "debt" apps/api/src apps/web/src packages/ --include=*.ts --include=*.tsx
gh issue list --limit 100 --state all --search "debt"
grep -rn "deriveDirectionFromCategory|debtReasonCategoryDirectionMap" apps packages
grep -rn "rpcClient.invoices|invoicesCreate|invoicesReceive" apps/web/src
grep -rn "createDebt: true" apps/api/src --include=*.test.ts
grep -rn "openingBalanceDzd: -|signedAmountDzd: -|-grossTotalDzd" apps/api/src --include=*.ts
```

Key references (see inline citations above for the full list):
`packages/contracts/src/debt-helpers.ts:24`,
`packages/contracts/src/core.ts:136-165`,
`apps/api/src/modules/company/finance.service.ts:181,216,237,241,255,295,353,374,422,496,760,831`,
`apps/api/src/modules/company/company.helpers.ts:51,61,69`,
`apps/api/src/modules/inventory/inventory.service.ts:392,405,413,422,433,862,893,929`,
`apps/api/src/modules/invoice/adapters/invoice-debt.port.ts:114,197,214,256,268`,
`apps/api/src/schema/company.ts:228,238,262`,
`apps/api/src/infrastructure/database/schema-definitions.ts:269,288,291,315`,
`apps/api/src/infrastructure/database/schema.ts:1352`,
`apps/web/src/features/debts/debt-create-page.tsx:163-190`,
`apps/web/src/features/debts/debt-cases-panel.tsx:163-188`,
`apps/web/src/features/debts/debt-ledger-panel.tsx:100-124,143-155,222-231`,
`apps/web/src/features/debts/record-payment-dialog.tsx:46`,
`apps/web/src/features/debts/employee-debt-panel.tsx:23`,
`apps/web/src/features/app-shell/workspace-mutations.ts:669,706`,
`apps/web/src/features/inventory/inventory-invoice-create-page.tsx:317-620`,
`apps/web/src/features/inventory/outbound-transfer-create-page-v2.tsx:36-54,134,270-303`,
`plans/PRD-bidirectional-counterparty-ledger.md` (sign convention §Solution,
reason-category table, void/payment rules).

Not verified at runtime: the API/web test suites and any probe. This worktree
has no `node_modules`; a probe file was written, the run failed with
`vitest is not recognized` / `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`, and the
probe was deleted (`git status --short` is clean). All sign conclusions are
source deductions using the exact helpers the runtime calls.

---

## 7. Owner decisions (settled) — 2026-09-30

The owner reviewed the analysis and an accountant's terminology pass, and decided:

**D1 — the PRD sign convention stays the law.** `PAYABLE` + a positive balance = "we owe
them". The four writers are fixed to obey it; the read side is not redefined.

**D1a — a salary advance means THE WORKER OWES US.** This corrects the analysis in §4.1,
which described a salary advance as "we owe the worker". Paying money ahead of work
earned makes the worker the debtor: it is a receivable against him until it is offset
against a wage that has been earned. §4.1's finding therefore narrows: the defect is not
that the *display* is backwards for an advance, it is that (a) the page never sends the
direction at all, so the intent is lost, and (b) the same economic state can be written
two ways (`PAYABLE` negative or `RECEIVABLE` positive), so the sign/direction pair is
never normalised. A wage that has *already been earned* and is then paid leaves a zero
balance — the two cases must be distinguished by the reason category, not by the fact
that money moved to a worker.

**D2 — the server derives the direction from the reason category** and rejects a
mismatch, so no writer (web, inventory, future imports) can store the intent backwards.
`direction` becomes non-optional for direct debts.

**D3 — workers get two accounts, one per direction.** This is now *required* by D1a: an
advance is a worker receivable, so worker + direction uniqueness and a direction-aware
lookup must exist. The dead consolidation path for workers is removed if it cannot work.

**D4 — the purchase debt uses one sign, and the invoice owns the truth.**
`OPENING +gross` on `PAYABLE`, `PAYMENT −paid`, so `currentBalance === remainingDebtDzd`
at every point. `recordInvoicePayment` posts `PAYMENT −amount` consistently, and the
missing `createDebt: true` tests are added.

**D5 — the two invoice systems are merged.** The API-only `invoice` module is deleted;
its correct sign handling and the invoice↔debt link are adopted into the inventory
invoice group, which is the only one with a UI. `debt_entry.invoice_id` either points at
the table that is actually used or is dropped — it must not keep pointing at a dead
table. The debt party detail exposes the invoice context (D6).

**D6 — no new debt↔project/warehouse columns.** Purchase debts inherit project and
warehouse through the invoice; the debt detail shows that context so "what was this debt
for?" is answerable without leaving the screen.

**D7 — one payment path.** A single `recordDebtPayment` accepts any LIVE entry (not only
`OPENING`), `ADJUSTMENT` is no longer labelled a payment, and `createEmployeeDebtEntry`
signs by entry type.

**D8 — the outbound transfer's first payment is implemented**, not removed: the debt is
created with `opening = −(remaining)` and the first payment posted as `PAYMENT +first`.
A control that asks for an amount and then drops it is not acceptable either way.

**D9 — terminology and labels.** Adopted from the accountant's pass, implemented in the
UI: `PAYABLE` = مستحقات علينا, `RECEIVABLE` = مستحقات لنا, the four states as
مستحق علينا / رصيد مستحق لنا / مستحق لنا / رصيد مستحق لهم, buttons تسجيل دفعة / تسجيل دين.
مدين، دائن، لنا عنده، علينا له are not used as standalone UI labels. The signed balance
stays internal: the interface always shows a positive amount together with the phrase
that states the direction.

---

## 8. What changed (lane `fix-debt-writers`)

Implemented D2, D3, D4, D7, D8. D5 (invoice-module merge) and D9 (UI terminology)
are deliberately out of this PR.

### D1a/D2 — direction derivation
`debtReasonCategoryDirectionMap.SALARY_ADVANCE` changed `PAYABLE → RECEIVABLE`:
a salary advance is a worker receivable (D1a), and D3 states "an advance is a
worker receivable". The PRD table at `plans/PRD-bidirectional-counterparty-ledger.md:61`
still says PAYABLE for SALARY_ADVANCE; the owner's D1a supersedes it. This is the
one place the PRD is knowingly overridden, and the reason the contracts test
`debtReasonCategoryDirectionMap` was updated.

A new `getLockedDirectionForCategory` returns the locked direction or `null`
(INVOICE_DRIVEN/OTHER/unknown) without throwing. `createDebtAccount` derives the
direction from `reasonCategory`, rejects a supplied direction that contradicts it
(`VALIDATION`), and uses the derived direction for the find-or-reuse lookup. The
`debtAccountCreateInputSchema` `superRefine` rejects the same mismatch at the wire.

This PR is the server/domain side plus one client line. The client's
`DEBT_CATEGORIES.SALARY_ADVANCE.impliedDirection` flips to `RECEIVABLE` here, in
the same commit as the server rejection: the moment the server refuses a
contradicting direction, a client still deriving `PAYABLE` for a salary advance
would turn a working action into a validation error, so the two move together.
The rest of the client direction work (always-positive amount plus the sent
direction) belongs to the terminology lane, which merges first (#447).

### D3 — one worker ledger per direction
Added `getDebtAccountByWorkerIdAndDirection` on `FinanceRepository` (sqlite +
in-memory). `createDebtAccount` looks up the `(worker, direction)` account instead
of the first worker account. The legacy single-column `debt_account_worker_unique`
index is swapped for the composite `debt_account_worker_direction_unique`
`(worker_id, direction)` via the idempotent
`applyDebtAccountWorkerDirectionMigration`. The company test harness mirrors the
composite index.

### D4 — one purchase sign, one invariant
`createInvoiceGroup` now writes `OPENING +grossTotalDzd` on `PAYABLE` and
`PAYMENT -paidAmountDzd` for the creation-time payment, matching
`recordInvoicePayment` (`PAYMENT -amount`). Invariant, tested with the analysis
sequence: 1000 gross → 600 after a 400 first payment → 0 after the remaining 600.
Before the fix the same sequence left the ledger at −1200.

### D7 — one payment path
`recordDebtPayment` accepts any LIVE entry, not only `OPENING`.
`createEmployeeDebtEntry` signs by entry type (a `PAYMENT` is `-amount`), targets
the `RECEIVABLE` ledger for an `ADVANCE`, and follows the open ledger for a
`PAYMENT` so a repayment offsets the advance. `employeeDebtEntryCreateInputSchema`
gained an optional `direction`. The `ADJUSTMENT`-vs-payment labels stay D9.

### D8 — the outbound first payment is implemented
`inventoryOutboundTransferCreateInputSchema` gained
`firstPaymentAmountDzd`. The web page sends the full transfer value as
`debtAmountDzd` plus `firstPaymentAmountDzd`; the service creates the debt on
`RECEIVABLE` with `OPENING +debtAmountDzd` and posts `PAYMENT -firstPaymentAmountDzd`,
so the balance is the amount still on credit. This is the D1a-normalised mirror of
the literal D8 signs: D8's `opening = −(remaining)` / `PAYMENT +first` is the
pre-normalisation "receivable stored as a negative payable" form (gross 500,
first 200 → `−500 + 200 = −300`, net `+300`). On a `RECEIVABLE` ledger the same
state normalises to `+500 − 200 = +300`, which is what the code does.

### Evidence
`.scratch/reviews/debt-writers/probe-evidence.md` holds the pre-fix runtime
numbers (purchase −600/−1200, outbound `PAYABLE +300`, direct advance
`PAYABLE −5000`, employee `PAYMENT +300 → 1300`, payment-on-adjustment rejected).
Every committed regression test asserts the opposite of those numbers.

### Design pass follow-through

The lane's own diff was put through the domain-modeling, codebase-design and
improve-codebase-architecture lenses (see
`.scratch/reviews/debt-writers/design-pass.md`). Three in-scope friction points
were fixed: the now-dead `getDebtAccountByWorkerId` repository method was
deleted, the unused throwing `deriveDirectionFromCategory` was deleted in favour
of the single `getLockedDirectionForCategory` accessor, and the hand-written
`createOutboundTransfer` input type was replaced by the contract's
`InventoryOutboundTransferCreateInput` so the wire schema and the service cannot
drift. The remaining findings (the client's duplicated category map, the
emergent purchase-debt invariant, the one-ledger employee read interface, the
outbound per-source-group debt multiplication, and the PRD's stale
`SALARY_ADVANCE` row) are recorded there with recommendations.
