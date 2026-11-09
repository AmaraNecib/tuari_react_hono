# Draft tickets: exact money before v1

For owner approval before GitHub publication. The first two tickets are decision children of the Wayfinder map. The remaining eight are execution children of the specification. This is ten NEW tickets, not ten PRs. Existing Salary v1 remains a separate origin and final release blocker, not a replacement issue.

Work the frontier one ticket at a time. The initial frontier is runtime feasibility. Human financial-contract approval follows it. Preserve the wide-refactor expand/migrate/contract sequence without claiming independent production activation. Safe batches can be green individually; otherwise keep a dependent unmerged integration sequence with full green promised at the integrated head. No double-authoritative balances.

Apply wayfinder:research to feasibility and wayfinder:grilling to the owner decision. Do not mark that human decision ready-for-agent. Execution tickets receive ready-for-agent with native dependency blockers and status:blocked where appropriate. The spec may carry ready-for-agent as requested by to-spec, but remains blocked by the decision tickets and is never a claim that unresolved policy is AFK-ready. Use the real GitHub tracker already evidenced by Salary v1 and existing Wayfinder labels, not a new local tracker configuration.

## Prove production money storage and a safe activation route

Wayfinder research, AFK.

## Question

Establish a reproducible exact-money storage path using the actual production runtimes and a non-destructive integration/recovery route before committing to an adapter.

## Acceptance criteria

- [ ] Record signed int64 binding/readback, sorting and scoped integer-mode behavior for the selected plain and encryption-capable production drivers. A different test driver is not proof.
- [ ] Check the current encrypted-binding build and plaintext-fallback issues without taking over their implementation or adding dependencies. Record which observed constraint actually blocks money activation.
- [ ] Compare narrow adapter options, schema initialization/transition/reopen behavior and dependent-integration versus independently green batches. Keep one authoritative ledger and avoid double scaling.
- [ ] Return a linked research asset and a resolution identifying a viable route, or explicit external blockers. An unbuildable encrypted runtime cannot be reported as a successful encrypted-money proof. Any resulting native external blocker is wired before activation can become takeable.

## Blocked by

None. Can start immediately.

## Approve the money ownership, precision and public contract

Wayfinder grilling, HITL.

## Question

Obtain the owner's concrete financial and compatibility decisions so an implementer does not choose schema or rounding policy implicitly.

## Acceptance criteria

- [ ] Review the proven runtime options with the owner. Record physical amount representation, exact JSON wire form, currency ownership/inheritance, account uniqueness implications and initial enabled currencies.
- [ ] Approve per-value and aggregate bounds, signed rounding, entered unit-price/rate scale and fractional-quantity rounding boundary with concrete examples.
- [ ] Select treatment of existing development schema without assuming deletion or customer-history adoption. Distinguish reviewed zero, unreviewed and NULL states.
- [ ] Resolve only through the owner's live answers. Link the resulting ADR/spec decision record. Keep FX, cross-currency settlement and salary excess/correction policies outside this decision unless the owner explicitly expands it.

## Blocked by

- Prove production money storage and a safe activation route

## Expand the exact money boundary without activating financial writes

Implementation prefactor, AFK after blockers.

## What to build

Provide a tested shared representation, exact wire/parser/formatter and narrow storage capability that current workflows can adopt without changing their behavior or activating a partial schema.

## Acceptance criteria

- [ ] Implement only the approved currency/scale/bounds/rounding decisions, with BigInt internal arithmetic and exact transport. Keep quantities separately typed.
- [ ] Prove parse/format, arithmetic, same-currency rejection, large values, overflows, signed boundaries and deterministic allocation with independent expected values.
- [ ] Provide the agreed narrow production-driver adapter and storage preparation with real-driver tests, avoiding global BigInt changes to timestamps/counts.
- [ ] No schema activation, second writable balance, lossy runtime bridge or existing public contract switch. Integration remains inert; if that cannot be guaranteed, keep the dependent sequence unmerged.
- [ ] Record a table-to-reader/writer matrix for all 17 current tables and newly introduced monetary tables, and demonstrate current workflows remain unchanged.

## Blocked by

- Approve the money ownership, precision and public contract

## Keep debt movements and settlements exact end to end

Implementation vertical slice, AFK after blockers.

## What to build

Create, read, settle, correct and void monetary obligations through the sole ledger with exact persisted amounts, wire values and user-visible balances.

## Acceptance criteria

- [ ] Convert debt_account and debt_entry with approved currency ownership and exact current/signed/running balances. Cover services, mappers, RPC, forms and affected displays.
- [ ] Preserve both obligation directions, gross exposure and existing account identities. No silent netting, blanket mixed-account freeze or duplicate salary balance.
- [ ] Prove partial/multiple settlement, unrelated-obligation preservation, correction/void attribution, bounds, currency mismatch and sorting/serialization.
- [ ] Prove same-connection immediate reservation, atomic rollback, duplicate-submit replay/conflict and competing-connection behavior for changed writers.
- [ ] Keep nonconverted connected writers unreachable from converted production accounts until coordinated activation, not silently coerced to Number.

## Blocked by

- Expand the exact money boundary without activating financial writes

## Reconcile invoices and allocated payments with exact amounts

Implementation vertical slice, AFK after blockers.

## What to build

Create and settle an invoice with exact line totals, paid/remaining amounts and payment allocations that agree with its linked debt.

## Acceptance criteria

- [ ] Convert invoice, invoice_line_item, payment and payment_allocation through actual runtime storage, service/RPC contracts and existing user-facing paths.
- [ ] Resolve the touched Drizzle/raw-SQL payment disagreement using initialized schema introspection and regression proof.
- [ ] Apply the approved quantity-times-price and line/total rounding rules. Allocation sums reconcile exactly, including 0.1 plus 0.2 and repeated remainder distribution.
- [ ] Preserve partial/multiple and unallocated payment semantics, direction, void behavior and typed validation. Large-amount cursors retain digits and correct ordering.
- [ ] Cover payment robustness overlap with named existing follow-up acceptance without claiming unrelated duplicate-id or transaction issues are all solved. No unsafe standalone activation.

## Blocked by

- Keep debt movements and settlements exact end to end

## Keep inventory purchases, transfers and asset charges exact

Implementation vertical slice, AFK after blockers.

## What to build

Purchase stock, value it, transfer it and record/correct equipment charges without changing monetary value or duplicating debt and project cost.

## Acceptance criteria

- [ ] Convert inventory_invoice_group, inventory_entry, inventory_asset_unit, inventory_outbound_transfer_item, inventory_asset_charge and inventory_asset_charge_revision with their contracts, direct writers and forms/views.
- [ ] Preserve independent quantity representation and six-decimal quantity behavior. Use the approved unit-price/rate scale and money rounding boundary.
- [ ] Reconcile gross/paid/debt, per-asset allocation, optional prices, transfer currencies/directions and old/new correction values.
- [ ] Prove purchase and outbound debt linkage against the exact ledger, atomic failure/replay, transfer availability and no duplicate project contribution.
- [ ] Keep one writer for shared inventory modules. If this slice cannot fit a fresh implementation context, split purchase/valuation from outbound/charges after mapping shared ownership, without changing release gates.

## Blocked by

- Keep debt movements and settlements exact end to end

## Use exact workforce amounts without changing salary meaning

Implementation vertical slice, AFK after blockers.

## What to build

Enter, preserve and display exact reference salaries, history and existing cash payment values as the foundation for the originating Salary v1 behavior.

## Acceptance criteria

- [ ] Convert employee, employee_state_history and employee_salary_payment monetary values with workforce RPC, forms, mappers and affected tables.
- [ ] Preserve NULL versus zero, historical reference meaning and existing cash payment meaning. Do not infer approved earnings from expected_amount or past payments.
- [ ] Integrate shared money boundaries into any new Salary v1 approved-earnings, allocation, opening and correction records; every new monetary field is covered by the same representation.
- [ ] Demonstrate reference 30000, approved 35000, paid 25000 retains 10000 owed once the origin behavior is integrated, without creating another mutable salary ledger.
- [ ] This representation ticket does not replace or close the existing Salary v1 issue. Its financial/UI feature acceptance and unresolved correction policy remain there. No unapproved write activation.

## Blocked by

- Keep debt movements and settlements exact end to end

## Preserve exact expenses and their correction history

Implementation vertical slice, AFK after blockers.

## What to build

Create, display, correct and void an expense while preserving exact current and historical amounts for project costing.

## Acceptance criteria

- [ ] Convert expense and expense_revision with approved ownership and exact repository, service/RPC, forms and history display.
- [ ] Preserve soft references, NULL previous amount and current creation/correction/void semantics.
- [ ] Prove exact fractional and large values, malformed/overprecision rejection, audit old/new values and atomic failure behavior.
- [ ] Reuse shared rendering and grouping preferences rather than introducing expense-specific money logic. Return exact project-cost inputs.
- [ ] Do not activate a mixed old/new total or implement unrelated expense features.

## Blocked by

- Expand the exact money boundary without activating financial writes

## Reconcile exact project costs, reports and shared presentation

Implementation integration slice, AFK after blockers.

## What to build

Show project totals, debt/inventory reports, dashboards and audit views whose exact amounts agree with their source transactions and remain readable throughout the app.

## Acceptance criteria

- [ ] Combine exact same-currency salary, material, asset-charge and expense contributions. No Number coercion, double-counted salary settlement or duplicate transfer cost.
- [ ] Preserve gross versus net and direction semantics, legitimate negative material contributions, rounding policy and NULL/zero behavior.
- [ ] Complete shared MoneyValue/forms, optional decimals/grouping, Arabic RTL, wire/cache/audit/export/workspace serialization and large-amount pagination proof.
- [ ] Run direct cross-module integration and affected browser cases on the integrated tree. Reuse source execution evidence only when its exact-tree validity is demonstrated.
- [ ] Refresh full monetary storage/writer/reader matrix. Any newly found monetary path becomes an explicit tracked blocker, not a release exemption.

## Blocked by

- Reconcile invoices and allocated payments with exact amounts
- Keep inventory purchases, transfers and asset charges exact
- Use exact workforce amounts without changing salary meaning
- Preserve exact expenses and their correction history

## Activate and verify exact money across all financial tables before v1

Implementation contract-and-release gate, AFK with owner approvals.

## What to build

Release one coherent exact-money application only after every financial table and user workflow, including the originating Salary v1 acceptance, is verified.

## Acceptance criteria

- [ ] Confirm all 17 current monetary tables plus new monetary tables use the approved representation. All live readers/writers, calculations and transport paths are exact; no transitional Number/REAL money path remains reachable.
- [ ] Apply only owner-approved schema/contracts/activation and development compatibility strategy. Remove obsolete forms only after every caller has migrated. Preserve records; do not reset/drop by implication.
- [ ] Prove actual production encryption-capable write/close/reopen and backup/restore with large exact amounts, currency and links. Enforce any external runtime/encryption blocker discovered during feasibility.
- [ ] Keep implementation acceptance separate from publication/merge/release authority. Require current-head local lenses, resolved findings, CI acceptance, protection and hosted verdict; obtain explicit UI and expensive-to-reverse approval.
- [ ] Keep v1 blocked until the existing Salary v1 issue's own full acceptance is delivered. Do not close the origin or unrelated issues solely because the money integration is green.

## Blocked by

- Reconcile exact project costs, reports and shared presentation
- Salary v1: approved earnings, flexible project allocations, payments and opening balances

## Publication procedure after owner approval

Create the map and specification, then create all child issues before wiring dependencies. Attach only decision children to the map and implementation children to the spec. Use native GitHub sub-issue and blocked_by relationships with database issue IDs. Link the spec and map by titled URL and link the existing Salary v1 origin without rewriting, closing or reparenting it. Final activation is blocked by Salary v1 as well as the integrated money scope; Salary v1 is not a blocker of research or the foundation, so no dependency cycle is introduced. The origin's feature implementation still respects the exact-ledger activation boundary.

Do not claim any publication or native relationship succeeded until the live API confirms it. Do not create duplicate issues after a partial failure; retain returned IDs and retry only missing relationships. Post no local reviewer evidence. This charting session resolves no decision tickets and starts no implementation.
