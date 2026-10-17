# Test audit — issue #460, round 2 (b0de3d02)

- BASE: `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`
- HEAD: `b0de3d0202a229cc24b34e563ac5b97ed3181cca` (worktree clean; only untracked `.scratch/`)
- Scope: `apps/web/src/features/debts/debts-mvp-web.test.tsx`, describe *"entry dialogs take the direction from the prop, not the amount's sign"* (lines 889–974)
- Source under test: `record-entry-payment-dialog.tsx` (phrases at :69/:73 from `accountDirection`), `void-entry-dialog.tsx:63-66/:102`, `debt-utils.ts:78-86`, `packages/contracts/src/debt-helpers.ts:120-131`

## Commands

| Command | Result |
|---|---|
| `git rev-parse HEAD` / `git status --porcelain` | `b0de3d02…`; clean (only `.scratch/` untracked) |
| `git diff origin/develop...b0de3d02 -- …/debts-mvp-web.test.tsx` | reviewed |
| `git diff 03ff355d..b0de3d02 -- …/debts-mvp-web.test.tsx` | reviewed (round-1 → round-2 delta) |
| `cd apps/web && npx vitest run src/features/debts/debts-mvp-web.test.tsx --reporter=dot` | **passed** — 1 file, 33/33 tests, 65.4s |

## Findings

**F1 — Correct (round-1 finding closed).** The coarse `getAllByText("مستحق علينا").length).toBeGreaterThan(0)` in `RecordEntryPaymentDialog` is gone. Both surfaces are now asserted with `getByText`, which throws on zero **or duplicate** matches: entry phrase exact string (`"مستحق علينا"` / `"مستحق لنا"`), max phrase regex (`/رصيد مستحق لنا/`, `/رصيد مستحق لهم/`). The test name (entry *and* max) is now truthful.

**F2 — Correct (both surfaces genuinely pinned).** Entry phrase comes from `entry.signedAmountDzd` (5000) and max phrase from `accountCurrentBalance` (-5000). A regression that fed `entry.signedAmountDzd` into `maxPaymentDisplay` would render `"مستحق علينا"` in the PAYABLE branch and fail `getByText(/رصيد مستحق لنا/)` — the two surfaces are independently pinned, not aliased. Both `queryByText` negative checks pin the absence of the opposite phrase.

**F3 — Correct (one sign + two directions is a real discriminator).** Same entry (`+5000`) and same balance (`-5000`) across both directions. Per `getDebtAccountBalanceState`: PAYABLE+5000→`owedByUs` vs RECEIVABLE+5000→`owedToUs`; PAYABLE−5000→`creditWithUs` vs RECEIVABLE−5000→`creditWithThem`. Any sign-only implementation renders `"مستحق لنا"`/`"رصيد مستحق لهم"` in *both* branches, so the PAYABLE branch of each test fails. Any prop-inversion regression fails both branches. The entry test's PAYABLE case additionally fails for the sign-driven case, so `VoidEntryDialog` is covered by the same logic (line 925).

**F4 — Note (low).** The regex matcher is substring-based, so a hypothetical *suffixed* phrase (`"رصيد مستحق لنا للطرف"`) would still satisfy `getByText(/رصيد مستحق لنا/)`. Bounded by the exact-string entry assertion and the `queryByText("مستحق لنا") === null` check. No false positive today: only the max `<p>` (label `"الحد الأقصى للدفعة:"`, ar.ts:1421) contains that text, and RTL regex matching uses an element's direct text nodes only, so no ancestor element can also match.

**F5 — Note (low).** In the RECEIVABLE branch the max assertion (`"رصيد مستحق لهم"`) matches sign-driven output as well, i.e. it is a control, not a discriminator. Acceptable: the PAYABLE branch of the same test carries the discrimination, and the mirrored direction guards against inversion.

**F6 — Note (informational).** The second render in each test is not unmounted; there is no subsequent test in the file, and RTL's auto-cleanup runs per test. No leakage observed (33/33 pass).

## Verdict

**PASS — no blockers.** Round-2 closes the round-1 finding: both the entry and max surfaces are pinned exactly, the single-sign/two-direction construction would fail under sign-driven, prop-ignoring, inverted-prop, or wrong-source-for-max regressions, the regex introduces no realistic false positive, and the file passes 33/33.
