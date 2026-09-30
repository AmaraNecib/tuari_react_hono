# #414 — design pass on the diff

Skills run against the working diff (new + modified files), per the standing
rule: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`.
Base: `55b71181` (`origin/develop`).

## domain-modeling

**Vocabulary.** The diff uses the settled terms from the Money & Inventory
glossary: **Expense** (tagged, counted in full), **Project charge** (asset
placement + expense), **Salary payment** (allocated days), **Stock item**. UI
copy follows the #413 terms (`عتاد مخصّص`, `أجور (أيام موزّعة`, `مواد مستهلكة`)
and adds `مخزون على الموقع`.

**Term introduced / resolved.** This diff decides the scope the glossary left
**Open** ("Project cost — … the scope … is not decided"). It resolves it to:
cost = expenses (full) + salary shares + LIVE stock charges + consumables
issued to the project; parked stock is inventory value, never cost. It also
introduces a distinct term, **parked inventory** (current value physically on
site), which the glossary does not yet name.

**Finding (out of lane scope).** `docs/domain/CONTEXT.md` and `CONTEXT-MAP.md`
are **untracked in the main worktree** (`D:/projects/tuari_react_hono`), not in
this branch or any commit, so they are the parent session's working files. I did
not edit them. Recommendation: the parent moves "Project cost" out of **Open**
into a resolved term and adds **Parked inventory**, referencing this diff. The
rule itself is stated in exactly one place in code (see below), so no code
change is needed for this.

**One place for the rule.** The four-source rule and the parked/cost split live
only in `project-cost.service.ts`; the contract file documents the shape, and
the design doc records the decision. No second computation exists.

**Unresolved term (ASK).** "Consumed there" is a proxy in an app with no
consumption event. It is documented once in the service and the design doc, and
flagged to the parent; see the design doc section "The one rule I could not
fully reconcile".

## codebase-design

**Seam is real.** `ProjectCostRepository` has two adapters (`SqliteProjectCostRepository`
in production, a hand-rolled fake in the service tests), so the port is not
hypothetical indirection. The service tests run without a database through the
same interface the handler uses.

**Depth.** `ProjectCostService` exposes one method (`getProjectCost`) behind
which sit four source rules, the salary-share math, deterministic ordering, the
parked/cost split, and the aggregate bound guard. Deleting it would push all
four rules to the RPC handler and the web page — the deletion test says keep.

**Fixed in scope — a shallow surface.** `valueConsumableIssue` was exported but
used only inside the service; a public helper with no second caller is surface
without leverage. Removed the `export`.

**Fixed in scope — a second copy of a type.** The port re-declared the movement
type union as a string literal. Added `InventoryMovementType` to the contracts
core and used it in both the wire schema and the port, so a new movement type
cannot drift between the two.

**Considered and kept.** The adapter reads the source tables directly instead of
calling the expenses/workforce/inventory services. That does repeat each owner's
predicate (`status = 'LIVE'`, split project join, movement destination). Kept
because (a) the owning modules do not expose project-scoped reads with the names
this screen needs, and (b) the repo's read models (`listInventoryValuations`,
the report aggregators) already read tables directly. The integration test
(`project-cost.integration.test.ts`) pins the expenses total against the
expenses module itself, which is the drift that matters most.

## improve-codebase-architecture

Friction the diff creates, with recommendations:

1. **Cross-domain read model has no owning-module seam.** The cost screen is the
   first reader that needs "project-scoped rows with names" from three modules.
   *Deepening opportunity:* if a second consumer appears, add
   `listProjectSalaryShares(projectId)` to the workforce module and a
   project-scoped consumables read to inventory, and let `ProjectCostService`
   compose them; that would delete the duplicated predicates. **Recommendation:
   follow-up only if a second consumer appears** — with one consumer the port is
   the simpler seam and the integration test covers the drift.
2. **Web money formatting is duplicated.** `project-cost-section.tsx` adds a
   fourth `formatNumber`/`formatDzd`-style helper (expenses, salary dialog and
   dashboard each have their own). *Deepening opportunity:* one `formatDzd`
   helper in `@/lib`. **Recommendation: follow-up issue** — extracting it now
   would touch untouched screens and grow this diff.
3. **The cost query is not invalidated by source mutations.** It relies on
   `staleTime: 0` + `refetchOnMount: "always"` instead of keying into
   `invalidateWorkspaceDomains`. **Recommendation: justified as-is.** The tab
   mounts on demand and is the only mount site, so a mutation on another screen
   cannot leave it stale while visible; the alternative is threading a
   parameterized key through three mutation modules for no observable gain.
4. **The aggregate bound is enforced by a hand-rolled `sumMoney`.** A second
   module now has a "sum money and refuse above MAX_MONEY_DZD" loop (the charge
   service has its own). *Deepening opportunity:* a shared
   `sumMoneyWithinBound(values)` in `@tuari/contracts`. **Recommendation:
   follow-up issue** — the semantics differ slightly (per-charge vs per-part
   field names in the error), so folding them is a separate, careful change.

## Outcome

Two in-scope fixes applied (shallow export removed; movement type unified).
Four findings reported with recommendations; none changes this PR's correctness.
No unresolved blocker inside the diff.

## Addendum — fixes applied after the parallel review round

The critic / edge / test-audit / standards reviewers ran against the first HEAD.
In-scope findings fixed in `d06ffee0`:

- blank/whitespace text is normalised to `null` at the read boundary, so one odd
  legacy row can no longer fail the whole response's output validation;
- `paymentDays ≤ 0` now refuses with a typed error instead of fabricating a
  multiple of the wage;
- `sumMoney` refuses `NaN`, not only an above-bound total, and its message no
  longer leaks the internal field key;
- SQL `ORDER BY` removed — the service owns ordering, with a new out-of-order
  test that makes it falsifiable;
- dead surface removed (`ProjectCostProjectRecord.name`, `movementType`);
- the misleading paired `amount` / rounded `dayRate` display was removed, so
  the two numbers a reader sees cannot fail to reconcile;
- parked consumables now carry an `id`, used as the React key;
- the RPC round-trip test now carries a fully populated `ProjectCost` and parses
  it with `projectCostSchema`; bound/blank/ordering/parked-only/empty-action
  test gaps closed.

Remaining findings reported, not fixed here:

1. **Consumed source is a business rule (ASK).** The app has no consumption
   event; the diff counts cumulative issuance into the project. Alternative:
   the inventory report's entry valuation of consumables located at the project.
   Recommendation: parent decides; the change is one adapter method.
2. **No browser E2E** (documented standard): the brief constrained Playwright
   and the tests cover the behaviour; recommend a follow-up
   `tests/e2e/project-cost.spec.ts`.
3. **No owning-module pin for salaries/stock/consumables**: only expenses is
   pinned against its owning module. Recommend a follow-up cross-module test
   for consumables (the acceptance clause names the inventory module).
4. **Shared helpers**: `toFailureResult`, `successResult` and web money
   formatting are duplicated across modules/features; a dedicated refactor.

