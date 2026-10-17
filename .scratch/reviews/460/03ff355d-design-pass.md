# Issue #460 — design pass, HEAD `03ff355d`

- Issue: [#460](https://github.com/AmaraNecib/tuari_react_hono/issues/460) — dead `dashboard-overview.tsx` + explicit `accountDirection` on the entry dialogs
- Design: `.scratch/implementation/460-design.md`
- Base: `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`
- HEAD: `03ff355d54a8085d3e00ed98cdcea8ed5744c1f8`
- Delta: 3 files, +165 / −141 — `apps/web/src/features/dashboard/dashboard-overview.tsx` deleted (−141); `debts-mvp-web.test.tsx` +84; `.scratch/implementation/460-design.md` +81
- Lenses: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- Posture: **read-only** — no source edited, nothing staged (`git status --porcelain` clean apart from this review file). One targeted test run (see Validation).
- Closure claim checked: this diff is the closure of **finding 6** in `.scratch/reviews/debt-terminology/design-pass.md` ("optional `accountDirection` on the two dialogs — follow-up"). Confirmed closed at the base by #458/#471 (required props) and now pinned by tests.

---

## Scope note (what this diff actually does)

The issue has two halves. **Half 2 (explicit direction) was already shipped at the base** by `0da0a275` (#458/#471): `void-entry-dialog.tsx:34` and `record-entry-payment-dialog.tsx:38` both declare `accountDirection: DebtAccount["direction"]` (required); `debt-ledger-panel.tsx:259,265` are the only production call sites and pass `debtAccount.direction`. Re-doing that would duplicate a shipped change. So the diff is: **delete the dead file** + **add the two tests the issue names in its verification**. That is the right split, and the design doc states it honestly (including that the tests cannot be red on a pre-diff checkout of this branch).

---

## domain-modeling

**Correct — no new rule, no duplicated rule.** The diff adds no production vocabulary, no constant, no message. `accountDirection` keeps the contract's name; the direction vocabulary (`PAYABLE`/`RECEIVABLE`, `مستحق علينا`/`مستحق لنا`) is consumed, not restated. `getDebtAccountBalanceDisplay` still owns "a phrase may not be rendered from a bare sign" — the tests exercise that rule through the dialog interface rather than re-asserting it in a new helper.

**Correct — literal Arabic strings in the tests are pinning, not a second source.** `debt-utils.test.ts` already pins `directions.*` against `getDebtDirectionLabel`; the new literals at `debts-mvp-web.test.tsx:920-931,950-963` sit in the same role. A phrasing change fails loudly. That asymmetry (phrase tables in contracts + i18n + literal test pins) is a pre-existing, recorded follow-up from the debt-terminology pass, not made worse here.

**Note — the tests pin two directions and one entry type only.** `openingEntry` (`:890-911`) is always `OPENING` / `LIVE` / `signedAmountDzd > 0`. That is deliberate and sufficient for the claim being pinned (one sign, two phrases), so this is a boundary of the pin, not a gap in it.

Nothing else found.

---

## codebase-design

**Correct — the deletion passes the deletion test.** At the base, `apps/web/src/features/dashboard/` contained exactly one file (`git ls-tree -r origin/develop -- apps/web/src/features/dashboard` → `dashboard-overview.tsx`). `git grep 'dashboard-overview\|DashboardOverview'` over tracked non-`.scratch` files now matches nothing in code; no barrel/index/route referenced it. Deleting it removes complexity instead of moving it.

**Correct — no empty directory left, no barrel orphan, no dangling import.** The directory no longer exists; no `index.ts` in it at the base; `tsc`-visible imports would have failed the build.

**Correct — the new tests cross the module's own interface.** They render the real dialogs via props and assert observable text (the interface *is* the test surface), rather than reaching past the seam. Red-proof holds: with a single positive amount, a sign-inferring implementation renders the *same* phrase for both directions, so one of the two `getByText` assertions must fail. The negative `queryByText(...).toBeNull()` half also rejects a both-branches rendering. This is a genuine contract pin (closing debt-terminology finding 6), not a shallow test.

**Orphan this diff created — stale doc path.** `docs/COMPLETION_STATUS.md:73` still lists
`apps/web/src/features/dashboard/dashboard-overview.tsx - Dashboard layout` as a completed deliverable (last touched `d90d0d35`). The diff made that line false. One-line cleanup, bounded to that file — **not applied here** (read-only pass). See findings table F1.

**Orphan this diff created — the i18n `dashboardPage` block.** `apps/web/src/i18n/resources/ar.ts:1178-1195` holds 14 keys; after the deletion the only surviving consumer is `dashboardPage.outstandingDebts` (`apps/web/src/features/app-shell/home-view-copy.ts:347`). The other 13 (`title`, `description`, `totalValue`, `agingAnalysis`, `topDebtors`, `quickActions`, `addInvoice`, `recordPayment`, `transferStock`, `viewReports`, `noData`, `noDebts`, `loadError`, `assets`, `overdue`) are now dead. The design doc (§Risks) calls pruning a sprawl into `ar.ts`; measured, it is a single contiguous block in a single file — the only grep hit for `dashboardPage` in the i18n tree is `resources/ar.ts`. So the "sprawl" characterisation overstates it. Still correctly deferred: unrelated to the issue, and the better fix is a lint rule for unused i18n keys, not a one-off deletion. See findings table F2 (cheap cleanup, recorded not applied) and F3 (follow-up).

**Note — the second test's name over-claims slightly.** `debts-mvp-web.test.tsx:942` is named "…phrases the entry **and the max** from accountDirection", but the positive assertion is `getAllByText("مستحق علينا").length).toBeGreaterThan(0)` — it does not distinguish the entry phrase from the max-payment phrase (a `within()` scope would). The discriminating power comes from the negative half plus the opposite-direction render, which is sound. Cosmetic; not worth a rewrite.

---

## improve-codebase-architecture

**Correct — zero production surface changed, so no new friction.** No interface, seam, adapter or call graph moves. The diff *reduces* friction on two axes: one dead module disappears from navigability, and the "direction is never inferred" rule moves from a type-level requirement into an executable assertion at the two places most likely to regress it.

**The one friction this change creates is grep-level navigability.** A future agent reading `resources/ar.ts` sees a coherent-looking `dashboardPage` block and has no signal that 13 of its 14 keys are dead — the same "dead thing looks live" class that this issue exists to remove, at i18n scope. That is F2/F3 below.

**No hypothesised seam introduced.** The tests call the components directly; no new adapter, no mocked dependency, nothing that would fail the "two adapters means a real seam" test.

---

## Findings

| # | Lens | Finding | Location | Verdict |
| --- | --- | --- | --- | --- |
| F1 | codebase-design | `COMPLETION_STATUS.md` still lists the deleted file as a shipped deliverable — orphan created by this diff | `docs/COMPLETION_STATUS.md:73` | **Cheap cleanup — exposed, not applied** (read-only pass). Recommended: drop the line, or mark it removed. |
| F2 | codebase-design / arch | 13 of 14 `dashboardPage.*` keys are dead after the deletion; only `outstandingDebts` is still read | `apps/web/src/i18n/resources/ar.ts:1178-1195`; consumer `home-view-copy.ts:347` | **Cheap cleanup — bounded to one file, not applied** (read-only pass). Design doc's "would sprawl" is overstated; see F3. |
| F3 | improve-codebase-architecture | i18n key pruning has no enforcement, so dead keys will re-accumulate after this one-off | repo-wide | **Follow-up (issue, not this PR)** — an unused-i18n-key lint/test beats another manual prune. |
| F4 | codebase-design | Test name claims it pins the max-payment phrase, but the positive assertion only checks "at least one occurrence" | `apps/web/src/features/debts/debts-mvp-web.test.tsx:942-963` | **Note (low)** — assertion is still discriminating via the negative half; a `within()` scope would match the name. |
| F5 | domain-modeling | `packages/contracts/src/debts.ts` still accepts optional `direction` and a signed `openingBalanceDzd`; the pointer is required on the web side only | `packages/contracts/src/debts.ts` | **Carried forward** — pre-existing, recorded by the debt-terminology pass; contract/API blast radius. |

**Deletion test verdict on the diff's own additions:** nothing added is shallow. The two tests are the thinnest thing that can pin the contract; the fixture is ~20 lines of the shared `DebtEntry` shape and is local to the new describe.

---

## Carried-forward notes (unchanged, non-blocking)

- **Closed here:** debt-terminology finding 6 — optional `accountDirection` on `void-entry-dialog` / `record-entry-payment-dialog`. Required at the base (#458/#471), now test-pinned.
- Still open from the debt-terminology pass: debt glossary + gross-vs-net ADR (`docs/domain/debt/CONTEXT.md` + `CONTEXT-MAP.md` + ADR); retire the duplicate i18n key pairs (`terminology.buttons.recordPayment` ≡ `debtLedger.entries.recordPaymentButton`; `terminology.states.settled` ≡ `debtsHub.filters.settled`); hub-filter predicate seam.
- F5 (contract-level optional direction / signed opening) remains the last copy of "direction may be inferred".
- `.scratch/implementation/460-design.md` is committed as part of this branch's diff; the repo already tracks `.scratch/` (prior design docs and review notes are tracked), so this matches convention.
- `docs/COMPLETION_STATUS.md` is a May-2026 snapshot doc; F1 is a one-line staleness fix, not a doc audit.

---

## Validation

- `apps/web`: `npx vitest run src/features/debts/debts-mvp-web.test.tsx` → **1 file passed, 33 tests passed** (~57s). The two new cases (`:912`, `:942`) are green on HEAD.
- `git grep 'dashboard-overview\|DashboardOverview'` (excluding `.scratch`) → only `docs/COMPLETION_STATUS.md:73`.
- `git ls-tree -r origin/develop -- apps/web/src/features/dashboard` → the one file; directory now absent.
- No Playwright run: the diff removes an unrendered file and adds unit tests; there is no user-visible flow, so no E2E or visual evidence applies (agree with the design doc).

## Verdict

**Approve. No blockers.**

Both halves of #460 are correctly resolved: the dead file is deleted with no surviving code reference, and the explicit-direction requirement (already shipped by #458/#471) is now pinned by two tests that can only pass if the prop — not the sign — drives the phrase. The two orphans the deletion exposed (F1 doc line, F2 i18n block) are real but cosmetic and outside the issue's stated scope; F1 is a one-line fix if the parent wants it in this PR, F2/F3 belong in a lint-backed cleanup issue.

Residual risks (none blocking):
- Dead `dashboardPage.*` keys keep a false "this namespace is live" signal until F2/F3 land.
- The max-payment phrase is asserted coarsely (F4); a future regression that broke *only* the max phrase while the entry phrase stayed direction-driven would still pass.
- F5: the contract still permits an inferred direction outside the web layer.

No source modified by this review.
