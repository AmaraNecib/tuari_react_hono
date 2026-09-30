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
  - `parts`: `{ expensesDzd, salariesDzd, stockDzd, chargedMaterialsDzd }`.
  - `expenses[]`: id, date, whatFor, amount, responsibleWorkerId, sellerId.
  - `salaries[]`: paymentId, employeeId, employeeName, days, dayRateDzd,
    amountDzd, paymentDate.
  - `stock[]`: chargeId, assetUnitId, assetName, amountDzd, placedAt.
  - `materialMovements[]`: movementId, itemDefinitionId, itemName, unit,
    quantity, unitPriceDzd, valueDzd, direction (`IN`/`OUT`), occurredAt. The
    list carries BOTH directions; `valueDzd` is the positive magnitude and
    `direction` is the sign.
  - `parkedInventory` — the **separate** inventory value of what is physically
    at the project (never in `totalDzd`): total plus the asset units currently
    at the project. Consumables at a project are charged, so they are NOT
    parked (see the settled rule below).

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
- **Material charged to the project (SETTLED — owner, supersedes the earlier
  "consumed" proxy)** — the **NET** of consumable `inventory_movement` rows in
  which the project is a party (`item_type = 'CONSUMABLE'`): a movement into the
  project (`to_project_id = project`) ADDS `roundMoney(unitPriceDzd ×
  quantity)`, a movement out of the project (`from_project_id = project`)
  SUBTRACTS it. The unit price is the linked entry's, the same valuation the
  inventory module uses in `listMovementValuations`. A project→project movement
  is one row: it subtracts at the source and adds at the destination.

  The owner's rule, verbatim:

  > **Project material cost is based on the net value of materials currently
  > charged to the project. A material becomes a project cost when it is
  > purchased directly for the project or transferred from a warehouse to the
  > project. If material is later transferred out of the project to a warehouse
  > or another project, its cost is removed from the original project and added
  > to the destination. Physical consumption does not require a separate event.**

  In one line: **cost follows the material, not the physical consumption
  event.** The Arabic for the accountant: **المادة تُحمَّل على المشروع عند
  دخولها إليه، وتُلغى من تكلفته عند خروجها منه.**

  The UI/contract term is **المواد المحمّلة على المشروع** / "material charged to
  the project". It must never be labelled "consumed" (`المستهلكة`): the system
  knows the material was charged, not that it was physically used.

  **Negative net (parent decision).** The net can be negative when more material
  left than entered. In that case the figure is SHOWN as computed and the screen
  shows an Arabic warning that says more material left the project than entered
  and that this is usually a transfer out recorded without its counterpart. The
  total is the plain arithmetic sum of the four parts and is shown even when it
  falls below zero. Refusing the screen and clamping to zero were both rejected:
  the first throws away the project's expenses/salaries/stock over one anomaly,
  the second hides it. The part and the total are signed-but-bounded; only an
  aggregate outside ±`MAX_MONEY_DZD` is refused.

- **Parked inventory (shown separately, never cost)** — the value of what is
  physically at the project right now, **assets only**: asset units
  (`purchase_price_dzd`). **Consumables are deliberately excluded**: a
  consumable at a project is charged to that project under the settled rule, so
  also listing it as parked would double-count it. The asset/tool rule is
  unchanged — a tool on site is inventory value, never cost.

### Physical consumption deliberately has no event

The product has **no "consumed" event** for consumables: only movements in/out
and a current balance. That is not a gap to fill here — the owner's rule makes
physical consumption irrelevant to cost. The charge is born when the material
enters the project and is reversed when it leaves; whether it was later used,
still on site, or resold does not move the project's figure. This is recorded
as a deliberate decision, not an unresolved question.

## Sources each query reads

| Part | Table(s) | Filter |
| --- | --- | --- |
| expenses | `expense` (+ `employee`, `external_counterparty` for names) | `project_id = ? AND status = 'LIVE'` |
| salaries | `employee_salary_payment_split` × `employee_salary_payment` (+ `employee`) | `split.project_id = ?` |
| stock | `inventory_asset_charge` (+ `inventory_asset_unit`) | `project_id = ? AND status = 'LIVE'` |
| material movements | `inventory_movement` (+ `inventory_entry`) | `item_type = 'CONSUMABLE'` AND (`to_project_id = ?` OR `from_project_id = ?`), excluding a same-project no-op |
| parked | `inventory_asset_unit` | `current_project_id = ?` |

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
  behind each source, the parked-asset block, a loading/error/empty split,
  and an empty state that says what to do (add an expense, move a tool, pay a
  wage).
- `features/projects/project-cost-queries.ts` — the project-scoped query.
- A new **التكلفة** tab on `project-details-page.tsx`.
- All copy in `ar.ts` under `detailPages.project.cost.*`; bars use the
  `chart-1..4` semantic tokens, so light and dark both come from the theme (no
  colour literals).
- No bare signed numbers; a material movement OUT is labelled as a reversal
  and its value is shown as charged; parked inventory is labelled as inventory
  value, and a per-source share is rendered as a positive percentage.

## Tests

- `project-cost.service.test.ts` — each source in isolation, the combination,
  a project with no activity, the salary day-rate math, the material/parked
  separation (charges are net of movements out; parked assets are never cost),
  the empty/absent project, and the aggregate-bound guard.
- `project-cost.repository.sqlite.test.ts` — the real SQL: live-vs-voided
  expenses and charges, split joins, movement valuation (both directions),
  parked assets.
- `tests/integration/project-cost-materials.test.ts` — the owner's worked
  example driven through the real `InventoryService`, the net-of-movements
  consistency check, and the parked/charge exclusion for consumables.
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
