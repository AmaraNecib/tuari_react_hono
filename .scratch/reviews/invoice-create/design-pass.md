# Design pass — fix-invoice-create lane

Design pass over the diff (owner items 11/10/13/12 + the item-offer seam), as
required by `docs/engineering-workflow.md` §5 and AGENTS.md. Reviewed through
`domain-modeling`, `codebase-design`, and `improve-codebase-architecture`.

## 1. domain-modeling

- The repo's `CONTEXT.md` is scoped to **Diagnostics & Telemetry** and has no
  inventory vocabulary, so the new terms (**row kind** vs **definition type**,
  **usage**, **offer filter**) do not belong in that glossary.
- The new rule is stated in exactly one place: `resolveItemOffer` in
  `packages/contracts/src/inventory-item-usage.ts`. The two evaluators (SQL in
  the repository, JS at the write gate) both consume the object it returns; the
  SQL/JS equivalence test is the cross-reference that keeps the code and the
  rule in agreement.
- **Finding (follow-up, not this PR):** the inventory domain has no glossary
  file. Creating one is a documentation decision larger than this diff; the
  terms are documented in the module doc-comment and
  `.scratch/implementation/item-offer-design.md`. Recommend a separate
  `docs/domain/inventory-CONTEXT.md` ticket if the owner wants inventory
  vocabulary in the repo glossary.

## 2. codebase-design

- `resolveItemOffer` as **data** (not a closure) is the right seam: the same
  rule compiles to SQL for the paged picker and evaluates in JS at the gate.
  Two real evaluators is a real seam, not a hypothetical one.
- `useItemDefinitionOptionsQuery` is deep: offer-filter mapping, debounce, the
  cursor chain, and page accumulation behind `{ usage, search, enabled }`.
  `ItemOptionPicker` is a thin UI **adapter** over it; deleting it would move
  per-row search state into a component that cannot hold hooks in a loop, so
  the complexity reappears — it stays.
- **Finding I fixed in this PR (deletion test):** the hook shipped a
  `resolve(id)` fetch with **no caller** — the invoice row holds the picked
  option in state, and the picker already prepends a selected option that is
  not on the loaded pages. That is a speculative seam (one adapter =
  hypothetical). Removed `resolve` and its cache; the comment records when a
  real caller (id-only edit hydration) would justify adding it.
- **Finding (kept, justified):** `inventoryItemDefinitionOptionSchema` is an
  alias of `inventoryItemDefinitionSchema`. The deletion test says no
  complexity reappears without it, but the alias names the picker's output
  contract; keeping it. Low value, low cost.
- **Finding (in-scope deviation, documented):** the shared cursor gained an
  optional `scope` alongside the design's `{sortKey, id}`. The design's
  "cursor valid only for the `(usage, search)` that produced it" requirement
  needs a fingerprint somewhere; a generic optional `scope` keeps the shared
  module column-agnostic. The company/in-memory callers pass no scope.

## 3. improve-codebase-architecture — friction created, and deepening opportunities

- **Friction:** the expense stock-item selector still reads the unpaged
  `inventoryItemDefinitionsList`, so the kind→options rule now has a second
  consumer that has not moved to the usage seam. It is a paper-cut, not a
  regression (its rule is "any active definition", the same as
  `STOCK_REFERENCE`). **Recommend follow-up**: point that selector at
  `useItemDefinitionOptionsQuery({ usage: { surface: "STOCK_REFERENCE" } })`.
- **Friction:** the catalog page keeps client-side windowing (#442) while the
  picker is server-paged — two paging shapes in one feature. **Recommend
  follow-up** (already noted out-of-scope in the design doc): move the catalog
  to a cursor-shaped control.
- **Opportunity:** `ItemOptionPicker` is the natural place a future listbox
  adapter drops in behind the same hook — no change to the hook's interface.
- **Opportunity:** the SQL/JS equivalence test is now the pattern for any
  future "rule as data" seam; a second consumer should extend the fixture set
  (each filter field needs a witness definition) rather than add a third copy.

## Outcome

- Fixed in this PR: the unused `resolve` seam (removed).
- Kept with rationale: the option-schema alias, the cursor `scope`.
- Follow-ups recommended (not fixed): an inventory glossary file, the expense
  selector on the usage seam, the catalog page on the paged endpoint.
- Nothing else found.
