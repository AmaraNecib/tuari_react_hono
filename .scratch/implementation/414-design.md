# #414 — Project page: what the project cost, broken down by source

mode: remote
ticket: AmaraNecib/tuari_react_hono#414
target ref / base: `origin/develop` @ `55b71181a493fcfe413b2375b1901e1a36f66513`
worktree/branch: `worktrees/feat-project-cost` @ `feat/project-cost`
review tier: High-assurance (financial aggregation: money attributed to a project)

## Settled domain (not re-derived here)

- `CONTEXT-MAP.md` → `docs/domain/CONTEXT.md` (Money & Inventory): Expense ≠
  Project charge ≠ Salary payment; a project charge is value attributed to a
  project for what it used.
- Closed dependencies: #411 expenses (`expense` + revisions), #412/#420 salary
  days + per-project split (`employee_salary_payment_split`), #413/#422 asset
  placement charge (`inventory_asset_charge`).
- `.scratch/prototype/NOTES.md` (main worktree): the verdict is layout **A** for
  the Expenses tab and screen **P** (cost breakdown) on the **project page**,
  not in the Expenses tab.

## Why one RPC

The four sources live in three modules (expenses, workforce, inventory) and
would otherwise be four round trips the page has to join and re-total in the
browser. The screen's whole point is one explainable number, so the aggregation
is server-side and the response carries both the parts and the rows behind them
(`which expense, whose days, which tool at which price`). One query key also
means the project page never shows four independently-loading totals that can
disagree mid-refresh.

### Public surface

`packages/contracts/src/project-cost.ts`

- `projectCostGet` input: `{ projectId }`.
- Output (entity result envelope, like the other read queries):
  - `totalDzd` — the four parts summed, `roundMoney`, write-bound checked.
  - `parts`: `{ expensesDzd, salariesDzd, stockDzd, consumablesDzd }`.
  - `expenses[]`: id, date, whatFor, amount, responsibleWorkerId, sellerId.
  - `salaries[]`: paymentId, employeeId, employeeName, days, dayRateDzd,
    amountDzd, paymentDate.
  - `stock[]`: chargeId, assetUnitId, assetName, amountDzd, placedAt.
  - `consumables[]`: movementId, itemDefinitionId, itemName, unit, quantity,
    unitPriceDzd, valueDzd, occurredAt, movementType.
  - `parkedInventory` — the **separate** inventory value (never in `totalDzd`):
    total plus the asset units and consumable balances currently at the project.

All money fields use `storedMoneyDzdSchema` for reads and
`nonNegativePaymentAmountSchema` for the computed aggregates (the #413/#422
"two ceilings" lesson: a stored row may predate the bound, but a computed total
must be representable).

## What counts as cost (the decision record)

- **Expenses** — a project's NON-VOIDED `expense` rows with that `projectId`,
  each counted **in full**. This is exactly the expenses module's own rule
  ("tagging a project charges the whole amount"); a shared cost belongs in the
  warehouse instead.
- **Salaries** — per `employee_salary_payment_split` line for the project:
  `amountDzd = roundMoney(actualAmountDzd * splitDays / paymentDays)`. The
  displayed `dayRateDzd` is `roundMoney(actualAmountDzd / paymentDays)`. The
  split is hand-typed (the assignment only seeds it), so the payment's
  `actualAmountDzd` is authoritative and an unallocated remainder is not
  charged to any project.
- **Stock charged** — `inventory_asset_charge` rows for the project with
  `status = 'LIVE'`, at their stored amount. A voided/corrected charge follows
  the #413 chain: the project keeps what it was charged; a later placement is a
  new charge.
- **Consumables consumed** — consumable `inventory_movement` rows **whose
  destination is the project** (`to_project_id = project`,
  `item_type = 'CONSUMABLE'`), valued `roundMoney(unitPriceDzd * quantity)`
  with the linked entry's unit price — the valuation the inventory module
  already uses in `listMovementValuations`/the movement report. This captures
  both a consumable bought straight into the project (a PURCHASE) and one
  issued from the warehouse (a TRANSFER).
- **Parked inventory (shown separately, never cost)** — the value of what is
  physically at the project right now: asset units (`purchase_price_dzd`) plus
  consumable balances (`quantity × entry unit price`). This is inventory value,
  not money spent.

### The one rule I could not fully reconcile — ASK

The app has **no "consumed" event** for consumables: only movements in/out and
a current balance. "Consumed there" is therefore a proxy. I chose **cumulative
issuance to the project** (movements into it), because:

- it is the only observable quantity that grows with what the site actually
  took, and
- parked stock (the current balance) is reported separately, so the two numbers
  are not the same figure.

Consequences a reviewer must confirm against the business rule:

1. A consumable issued to project A and later transferred out to a warehouse or
   project B is counted at A in full and (once) at B — cumulative issuance, not
   "net of returns".
2. A consumable bought straight into the project counts even if it is still
   sitting unused in the project's balance.

If the intended rule is instead "the inventory module's `listInventoryValuations`
value of CONSUMABLE entries whose destination is the project", the change is
one method in the repository adapter (`listConsumableIssues`); no contract or
service change. I flagged this to the parent rather than guessing further.

## Sources each query reads

| Part | Table(s) | Filter |
| --- | --- | --- |
| expenses | `expense` (+ `employee`, `external_counterparty` for names) | `project_id = ? AND status = 'LIVE'` |
| salaries | `employee_salary_payment_split` × `employee_salary_payment` (+ `employee`) | `split.project_id = ?` |
| stock | `inventory_asset_charge` (+ `inventory_asset_unit`) | `project_id = ? AND status = 'LIVE'` |
| consumables | `inventory_movement` (+ `inventory_entry`) | `to_project_id = ? AND item_type = 'CONSUMABLE'` |
| parked | `inventory_asset_unit`, `inventory_consumable_balance` (+ `inventory_entry`) | `current_project_id = ?` / `project_id = ?` |

## API shape

New `apps/api/src/modules/project-cost/`:

- `project-cost.types.ts` — row records + the `ProjectCostRepository` port.
- `project-cost.service.ts` — the deep seam: validates the project, sums the
  four parts with `roundMoney`, guards the aggregate bound, computes salary
  shares, and never adds parked value to the total.
- `adapters/sqlite-project-cost.repository.ts` — read-only drizzle queries.
- Tests use a hand-rolled fake port (service rules) and a real `:memory:`
  sqlite DB (adapter SQL), plus a router test through auth+contract.

Wiring: `app/dependencies.ts` builds the sqlite repo + service;
`rpc/router.ts` takes `projectCostService`; `rpc/handlers/project-cost.ts`
exposes `projectCostGet` as a permissioned read, mapped like the other reads.

## Web shape

- `features/projects/project-cost-section.tsx` — the P screen: the total, four
  labelled bars with each source's share (display-only percent), the lists
  behind each source, the parked-inventory block, a loading/error/empty split,
  and an empty state that says what to do (add an expense, move a tool, pay a
  wage).
- `features/projects/project-cost-queries.ts` — the project-scoped query.
- A new **التكلفة** tab on `project-details-page.tsx`.
- All copy in `ar.ts` under `detailPages.project.cost.*`; bars use the
  `chart-1..4` semantic tokens, so light and dark both come from the theme (no
  colour literals).
- No bare signed numbers; parked inventory is labelled as inventory value, and
  a per-source share is rendered as a positive percentage.

## Tests

- `project-cost.service.test.ts` — each source in isolation, the combination,
  a project with no activity, the salary day-rate math, the consumed/parked
  separation, the empty/absent project, and the aggregate-bound guard.
- `project-cost.repository.sqlite.test.ts` — the real SQL: live-vs-voided
  expenses and charges, split joins, movement valuation, parked balances.
- `project-cost.router.test.ts` (or a router case) — the RPC through
  auth + contract, and the "unassigned then assigned expense" path driven
  through the **real expenses module**.
- `project-cost-section.test.tsx` — render, the four parts and shares, the
  lists, the empty state, the parked block.
- `tests/e2e/project-cost.spec.ts` — real browser: open a project, see the cost
  tab, seed an expense and assert the total/part update.

## Base / risks

- Additive only: no schema change, no migration. The adapter reads existing
  tables.
- Money is duplicated nowhere: the parts are computed from the source tables
  and pinned against the source modules in tests; persistence stays whatever the
  source wrote.
- High-assurance tier → debate + test-audit required before reporting.
