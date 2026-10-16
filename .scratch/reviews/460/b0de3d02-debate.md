# Debate — #460 round 2 (dead `dashboard-overview.tsx` + entry-dialog direction)

- **Issue:** #460. **BASE:** `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`. **HEAD:** `b0de3d0202a229cc24b34e563ac5b97ed3181cca`.
- **Diff (`origin/develop...b0de3d02`):** 5 files, +182/−157. Round-2 commit `b0de3d02` touches 4 files (+29/−28): test assertion, `ar.ts` key prune, `docs/COMPLETION_STATUS.md:73`, design doc.
- **Round 1** (`03ff355d-debate.md`) approved, no blockers; F1/F2/F4 were the three non-blocking follow-ups.
- **Verification run in this session (read-only):** `node scripts/check-i18n-keys.mjs` → missing 0, map-key literals 0, warn 0 (exit 0). `cd apps/web && npx vitest run src/features/debts/debts-mvp-web.test.tsx -t "direction from the prop"` → **2 passed / 31 skipped** (from repo root the same command fails on `@/i18n` alias resolution — the suite must be run from `apps/web`). Repo-wide `grep dashboardPage` → only `ar.ts:1178`, `home-view-copy.ts:347`, `check-i18n-keys.mjs:34`, `tests/e2e/i18n-raw-keys.spec.ts:13`. `ls apps/web/src/i18n/resources/` → `ar.ts` only (no cross-locale drift).

## Critic findings

**C1 — F4 fix: is the max-phrase assertion exact? Partly, by construction not by matcher (severity 2).** `debts-mvp-web.test.tsx:963` uses `getByText(/رصيد مستحق لنا/)` — a *substring* regex, not an exact string. It passes only because of two facts I verified in source, not in the assertion: (a) `DEBT_BALANCE_STATE_PHRASE` (`packages/contracts/src/debt-helpers.ts:88-94`) makes `creditWithUs` = `"رصيد مستحق لنا"` and `owedToUs` = `"مستحق لنا"` — distinct strings, so the prefix `رصيد ` disambiguates; (b) RTL `getNodeText` returns only direct text nodes, so the regex lands on the max-payment `<p>` (`record-entry-payment-dialog.tsx:104-106`) and not its ancestors. `getByText` throwing on multiple matches is itself evidence the match was unique (the run passed). Gap: the assertion never names the max surface (`الحد الأقصى للدفعة:`), so it would still pass if the same phrase were rendered anywhere else in the dialog. Narrower than it reads; not a regression risk today.

**C2 — F4 fix bought distinctness with an impossible fixture (severity 2).** `accountCurrentBalance={-5000}` (`:945`, `:960`) while the entry is `signedAmountDzd: +5000` (`:903`). A PAYABLE account whose opening is +5000 cannot have a current balance of −5000, and the derived `maxPayment = accountCurrentBalance` (`record-entry-payment-dialog.tsx:47`) is negative, so the dialog renders "الحد الأقصى للدفعة: رصيد مستحق لنا دج 5,000" — a credit used as a payment ceiling, a state production cannot reach. The test is still valid as a render assertion; it is no longer a faithful state.

**C3 — F2 fix: no dangling `t()` reference (severity 1) — CLEARED.** `check-i18n-keys.mjs` exits 0 with zero missing keys; no test asserts the removed keys; `ar.ts` is the only resource file. `dashboardPage` stays declared as a namespace in `check-i18n-keys.mjs:34` and in the raw-key e2e regex, both harmless while `outstandingDebts` survives.

**C4 — F1 fix: the doc line is accurate but the fix is partial (severity 2).** `docs/COMPLETION_STATUS.md:73` now reads `... - Dashboard layout (removed in #460: dead code, never imported; the live dashboard is the app-shell home view + report-builder)` — accurate and consistent with round 1's importer/route verification. But the four sibling bullets immediately below (`5 key metric cards …`, `Card rendering with report data`, `Loading states and error handling`) described that deleted component and remain unannotated, as does the round-1-noted refresh-interval claim. Only one of the stale lines was closed.

**C5 — F2 residual: the generator can undo the prune (severity 2, unverified).** The design doc admits the durable fix is an unused-key lint rule. `scripts/generate-i18n-ar.mjs` is generator-owned; I did not read its source of truth, so whether it re-emits `dashboardPage.*` on the next run is unproven. Residual, not a defect in this diff.

**C6 — round-1 C5 (exact-text absence assertions) still stands (severity 1).** `queryByText("مستحق لنا")` is exact-match on direct text nodes (`:964`, `:951`, `:970`, `:923`); an embedded opposite phrase inside a longer label would still pass. Unchanged by round 2, correctly deferred.

## Defender replies

**D1 (to C1), 8/10.** The regex is a deliberate, *stronger* choice than the round-1 `getAllByText(...).length > 0`: requiring the `رصيد ` prefix is exactly what makes the max surface distinguishable from the entry surface, and the two strings are disjoint in the contract table, so no substring collision is possible for the shapes this component renders. The pass proves uniqueness.
**Counter:** correct that it is strictly better than round 1; the critic's point is that the *pinning* is implied by string disjointness, not asserted by the test. Note.

**D2 (to C2), 6/10.** `RecordEntryPaymentDialog` only reads `accountCurrentBalance` for the max display and the amount guard; the test types no amount, so the impossible balance is inert. The alternative (a reachable −5000 account) requires a paid-down opening that the fixture would have to model, and the point of the case is the phrase, not the ledger.
**Counter:** accepted as a trade-off, but it is a fixture that can never occur in production and should be stated in the test comment (it currently explains the credit, not the unreachability).

**D3 (to C3), 9/10.** Verified by the tool, not by argument: 0 missing keys, 0 fallback gaps, one locale file, no key-existence test. Nothing references the removed keys.
**Counter:** none. Cleared.

**D4 (to C4), 6/10.** `COMPLETION_STATUS.md` is a historical delivery ledger keyed to `e51e203`; annotating the one line the round-1 review named is the bounded fix. Annotating every sibling bullet turns a status log into a churn file.
**Counter:** partial correction inside a single block is the worst of both worlds — a reader now sees one line marked removed and four neighbours still implying the file existed. Cheap to finish; note.

**D5 (to C6), 7/10.** No current call site concatenates an opposite phrase into a label, so the exact-text absence check is adequate for today's shapes.
**Counter:** unchanged from round 1; keep as residual.

## Synthesis

| # | Finding | Sev | Verdict |
|---|---|---|---|
| F4 (round 1) | Max-phrase assertion | 2 | **CLOSED — fix holds.** `getByText(/رصيد مستحق لنا/)` / `(/رصيد مستحق لهم/)` pins the max surface; the phrases are disjoint in `debt-helpers.ts:88-94`; both tests pass (`2 passed`). Residual: matcher is substring and never names `الحد الأقصى للدفعة:`. |
| F4 fixture | `accountCurrentBalance={-5000}` + `+5000` opening | 2 | **NOTE (non-blocking).** Unreachable state; add one comment line or drop the negative balance. |
| F1 (round 1) | `docs/COMPLETION_STATUS.md:73` | 2 | **CLOSED, partial.** Line accurate and annotated; sibling bullets at `:74-76` still describe the deleted component. |
| F2 (round 1) | 13 orphaned `dashboardPage.*` keys | 2 | **CLOSED — no dangling reference.** `check-i18n-keys.mjs` exit 0, 0 missing; only consumer `home-view-copy.ts:347` kept. Residual: generator may re-emit (C5, unverified). |
| C6 | exact-text absence assertions | 1 | **DEFER — note in PR** (as round 1). |
| — | Any new production behaviour change | — | **None.** `git show b0de3d02 --stat`: test, i18n data, doc, design doc only. |

**No must-fix / blocker (8-10) findings.** All three round-1 follow-ups are genuinely closed, and the only new observations are a fixture-realism note and a partial doc annotation — both cosmetic.

### Verdict

**APPROVE round 2 — no must-fix items.** Ship it. Non-blocking residue: (a) the max-phrase matcher is a substring and does not name the max-payment label; (b) `accountCurrentBalance={-5000}` is an unreachable ledger state, worth one clarifying comment; (c) `docs/COMPLETION_STATUS.md:74-76` still read as if `dashboard-overview.tsx` existed; (d) the unused-key lint rule and the generator-will-re-emit question remain open follow-ups.
