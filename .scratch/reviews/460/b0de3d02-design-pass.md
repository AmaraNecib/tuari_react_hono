# Issue #460 — design pass, round 2, HEAD `b0de3d02`

- Issue: [#460](https://github.com/AmaraNecib/tuari_react_hono/issues/460) — dead `dashboard-overview.tsx` + explicit `accountDirection` on the entry dialogs
- Design: `.scratch/implementation/460-design.md` (updated with the review-round additions)
- Base: `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`; HEAD: `b0de3d0202a229cc24b34e563ac5b97ed3181cca`
- Round-1 sibling: `.scratch/reviews/460/03ff355d-design-pass.md` (approved, no blockers; exposed F1–F5)
- Round-2 delta (`git diff 03ff355d...b0de3d02`): 3 files — `docs/COMPLETION_STATUS.md:73` (1 line), `apps/web/src/i18n/resources/ar.ts` (−15 keys), `debts-mvp-web.test.tsx` (max-phrase assertions + `accountCurrentBalance: -5000`)
- Lenses: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- Posture: **read-only** — no source edited, nothing staged (`git status --porcelain` shows only untracked `.scratch/reviews/460/`)

---

## Landing check on the three applied findings

**F1 — `docs/COMPLETION_STATUS.md:73` — applied, lands.** The line now reads
`- [x] apps/web/src/features/dashboard/dashboard-overview.tsx - Dashboard layout (removed in #460: dead code, never imported; the live dashboard is the app-shell home view + report-builder)`.
The parent took round 1's second option ("drop the line, **or** mark it removed") and marked it: the doc no longer claims a live deliverable, and the historical Priority-4 record survives. The path string is still greppable inside the doc, but as an explicit removal note, not a live reference — that is the intended reading. Correct.

**F2 — orphaned `dashboardPage.*` keys — applied, lands, no new orphans.** The block at `apps/web/src/i18n/resources/ar.ts:1178` is now exactly `dashboardPage: { outstandingDebts: "الديون المتبقية" }`. The diff removes **15** keys (`title`, `description`, `totalValue`, `agingAnalysis`, `topDebtors`, `quickActions`, `addInvoice`, `recordPayment`, `transferStock`, `viewReports`, `noData`, `noDebts`, `loadError`, `assets`, `overdue`) — round 1's prose said "14 keys / 13 orphaned" while listing those same 15 names, so the round-1 count was off by one; the removal set is complete either way. Verified no surviving reader: `grep -rn 'dashboardPage\.' apps/web/src tests` → exactly one hit, `apps/web/src/features/app-shell/home-view-copy.ts:347` (`outstandingDebts`), plus the namespace-name regex in `tests/e2e/i18n-raw-keys.spec.ts:13` (a raw-key detector, not a key consumer). Only `ar.ts` exists under `apps/web/src/i18n/resources/`, so no locale-parity break. No new orphan created. Correct.

**F4 — coarse max assertion / test-name mismatch — applied, lands.** `RecordEntryPaymentDialog` is now rendered with `accountCurrentBalance: -5000`, so the max surface renders an *overpaid* phrase rather than repeating the entry phrase. The component puts the entry phrase in its own `<p>` (`openingBalance.phrase`) and the max phrase inside a separate `<p>` prefixed by `t("debts.payment.maxAmount")` + `" دج "` + amount, so `getByText("مستحق علينا")` (exact) pins the entry phrases while `getByText(/رصيد مستحق لنا/)` / `getByText(/رصيد مستحق لهم/)` (regex, substring) pin the max phrase. A regression breaking *only* the max phrase now fails, and the test name ("phrases the entry and the max from accountDirection") matches what is asserted. Suite green: **1 file, 33 tests passed** (~65s).

---

## domain-modeling

**Nothing found.** The round-2 delta adds no production vocabulary, constant, message, or rule. `accountDirection` keeps the contract's name; `PAYABLE`/`RECEIVABLE` and `مستحق علينا`/`مستحق لنا`/`رصيد مستحق لنا`/`رصيد مستحق لهم` are consumed, not restated — the new literals sit in the same pinning role as `debt-utils.test.ts:19-22`, and `getDebtAccountBalanceDisplay` still owns the rule the tests exercise. Removing the 15 i18n keys removes vocabulary, adds none. The `-5000` fixture makes the test *more* precise about which surface carries which phrase, which is a sharpening, not a drift.

## codebase-design

**Nothing found.** Deletion test still passes (no importer; directory gone; `tsc` would have caught a straggler). The F4 change keeps the tests crossing the module's own interface — props in, observable text out — and strengthens the red-proof: with one positive entry amount and a negative account balance, a sign-inferring implementation must render the same phrase twice within a surface, so the opposite-direction render and the `queryByText(...).toBeNull()` half cannot both hold. The i18n prune is bounded to one contiguous block in the one locale file, so it is a removal of complexity, not a move. F1's annotation is the weaker of the two round-1 options only in that the dead path string remains greppable in `docs/`; cosmetic, no runtime or navigability cost.

## improve-codebase-architecture

**Nothing found.** Zero production surface changed in round 2: no interface, seam, adapter, or call graph moves; the only production file touched is a resource table, and it shrinks. Friction strictly decreases — a 15-key block that looked coherently live is gone, so the "dead thing looks live" signal round 1 flagged at i18n scope is removed for this namespace. No hypothesised seam introduced.

---

## Follow-up disposition

| # | Lens | Finding | Verdict after round 2 |
| --- | --- | --- | --- |
| F3 | improve-codebase-architecture | i18n key pruning has no enforcement, so dead keys re-accumulate after this manual prune | **Correctly recorded, still open.** Round 2 proves the point: it needed a hand-prune of 15 keys. Nothing in the diff lints i18n usage, and `docs/COMPLETION_STATUS.md` shows this is the second manual prune class in this area. Belongs in a follow-up issue (unused-i18n-key check/test), not here. |
| F5 | domain-modeling | `packages/contracts/src/debts.ts` still permits optional `direction` and a signed opening; the pointer is required on the web side only | **Correctly recorded, unchanged.** Round-2 diff touches no contracts file; the design doc's Non-goals still carries it as pre-existing and owned by the debt-terminology pass. Not made worse, not closed. |

The design doc now records all three round-2 additions (items 3–5 under "Review-round additions"), which matches the diff. F1/F2/F4 are closed; F3/F5 remain correctly parked as follow-ups.

---

## Validation

- `apps/web`: `npx vitest run src/features/debts/debts-mvp-web.test.tsx` → **1 file passed, 33 tests passed** (~65s). Both new cases (`:912`, `:942`) green on HEAD.
- `grep -rn 'dashboardPage\.' apps/web/src tests` → only `home-view-copy.ts:347`; `ls apps/web/src/i18n/resources/` → `ar.ts` only.
- `grep -rn 'dashboard-overview\|DashboardOverview'` (excluding `.scratch/`, `.git/`) → `docs/COMPLETION_STATUS.md:73` only, as the removal annotation.
- No Playwright run: the delta removes i18n keys and tightens a unit assertion; no user-visible flow changed, so no E2E or visual evidence applies.

## Verdict

**Approve. No blockers.** F1, F2 and F4 land correctly and created no new orphans; the round-2 tests are strictly more discriminating than round 1's. F3 and F5 remain accurately recorded follow-ups, not silent deferrals. `nothing found` for all three lenses.

Residual risks (none blocking):
- F3 until a lint/test enforces it — the next dead-key batch will again need a manual prune.
- F5 — the contract still permits an inferred direction outside the web layer.
- `docs/COMPLETION_STATUS.md:73` still contains the dead path as an annotation; a doc-hygiene pass could drop the line entirely.

No source modified by this review. (Review-only/no-edit instruction wins over any progress-writing convention; no `progress.md` written.)
