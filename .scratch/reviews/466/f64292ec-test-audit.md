# Test audit — issue #466 (auto-close workflow)

- **Worktree:** `D:/projects/tuari_react_hono/worktrees/fix-autoclose-workflow`
- **Range:** base `073af118` → head `f64292ec` (contains `4ab192b5` adjacency fix, `f64292ec` negation fix)
- **Artifact under audit:** `scripts/ci/test-close-linked-issues.sh` (362 lines) driving `scripts/ci/close-linked-issues.sh` (322 lines)
- **Auditor:** test-audit (edge-case hunter / coverage analyst / quality reviewer, one pass)
- **Evidence:** `.scratch/reviews/466/fixed.log`, `.scratch/reviews/466/base.log`, `.scratch/reviews/466/probe-fixed.log`, `.scratch/reviews/466/probe.sh`

## Verdict

**NO BLOCKER.** The claim *"the tests pin the #466 behaviour and fail if the fix is reverted"* is **proven**:
the same test file against the pre-fix script fails **8** assertions and exits 1; against the fixed
script it is **60 PASS / 0 FAIL**, exit 0. All 8 failures are exactly the two #466 changes; no
unrelated assertion breaks, so the suite is not accidentally coupled.

## 1. Revert experiment (executed)

```
bash scripts/ci/test-close-linked-issues.sh
  → PASS=60 FAIL=0   exit 0                       (.scratch/reviews/466/fixed.log)

R=$(mktemp -d); git show 073af118:scripts/ci/close-linked-issues.sh > $R/close-linked-issues.sh
cp scripts/ci/test-close-linked-issues.sh $R/; timeout 280 bash $R/test-close-linked-issues.sh
  → PASS=52 FAIL=8   exit 1                       (.scratch/reviews/466/base.log)
```

Exact FAIL list against the pre-fix script (`base.log` line numbers):

| # | log:line | failing assertion | attribution |
|---|----------|-------------------|-------------|
| 1 | 20 | `prose keyword far from the reference never closes (#442 regression) did NOT close #122` | `4ab192b5` adjacency (`[^#]*` gap) |
| 2 | 31 | `prose 'the fix for #N' never closes did NOT close #1220` | `4ab192b5` adjacency |
| 3 | 49 | `'does not close #N' never closes did NOT close #128` | `f64292ec` negation |
| 4 | 60 | `negation is echoed` (`Ignoring #128` absent) | `f64292ec` negation |
| 5 | 71 | `'does not resolve #N' never closes did NOT close #129` | `f64292ec` negation |
| 6 | 82 | `'never fixes #N' never closes did NOT close #130` | `f64292ec` negation |
| 7 | 93 | `the negated reference in a mixed body is dropped (#131) did NOT close #131` | `f64292ec` negation |
| 8 | 108 | `a trailing negated close does not (#134) did NOT close #134` | `f64292ec` negation |

The captured pre-fix output proves the failures are **real PATCHes**, not log drift:

```
FAIL ... did NOT close #122   actual: [yes]
  |   CLOSED #122            <- pre-fix script really closed a merely-mentioning PR
```

Failures 1–2 come from the adjacency commit only; 3–8 from the negation commit only. Each commit is
independently pinned by the suite.

## 2. Assertion quality

- **Side effect, not log text — confirmed.** `assert_closed` / `assert_not_closed`
  (test lines 93–94) test the existence of `$TMP/closed_$N`, and that file is created *only* in the
  fake-curl `PATCH:issues/*` branch (test lines 70–77). A close is therefore proven by the HTTP
  PATCH, exactly the production effect. Log greps (`assert_has`) are additional, never the sole check.
- **"Not closed" cannot be satisfied by a dead extractor in the mixed cases.**
  `#131/#132` ("This does not close #131, but Closes #132.") and `#133/#134` ("Closes #133. It does
  not fix #134.") pair a must-close with a must-not-close **in one body**, so an extractor that
  returns nothing fails the must-close half. `assert_has "$OUT" "Ignoring #128"` additionally pins the
  negation *code path* (only the negation loop emits that line).
- **Minor gap:** `#129` and `#130` are must-not-close-only with no echo assertion. If the negation pass
  were deleted entirely they would still pass — but `#128/#131/#134` cover the same class, so the
  class as a whole is pinned. Non-blocking.
- **Determinism:** no network, no sleeps, `mktemp` sandboxes, stdin-driven fixtures. 3 full runs
  (fixed, base, 2 probes) produced identical totals → no flake observed.
- **CI gate works:** last line is `[ "$FAIL" -eq 0 ]`, and exit codes were observed 0 (fixed) / 1
  (base). The suite can gate a pipeline.

## 3. Missing edge cases (probed empirically)

Probe: `.scratch/reviews/466/probe.sh` runs the real script per candidate body with the fake curl and
reports which numbers received a PATCH. Full transcript: `probe-fixed.log`.

### Real risks (worth a follow-up issue, not blockers)

1. **🟠 Negation wrapped across a newline still closes the issue.**
   Body `"This does not\nclose #150."` → **closes #150**.
   Cause: `grep` is line-based, so the negation pattern (script lines 176–182) cannot span the break,
   while the affirmative pattern sees a bare `close #150` on line 2.
   Expected outcome: no close. Same defect class as #466, just a rare whitespace shape.
   Suggested test body (exact): `$'This does not\nclose #150.'` → `assert_not_closed` 150.
   Risk of harm: wrongful close of an open issue.
2. **🟠 Two filler words put a benign negator in front of a real close → the delivery is never closed.**
   `"Not urgent but Closes #150."` → **nothing closed**; `"This not only fixes #150 but also tidies
   the hook."` → **nothing closed**.
   Cause: script lines 176–182 allow `(space + word){0,2}` between the negator and the keyword.
   Contrast: `"This is not a rewrite. Closes #150."` closes correctly (a period blocks the filler), so
   only the no-punctuation wording is affected.
   Expected outcome: `not only fixes #150` should close #150 (it *is* an affirmative close).
   This is the deliberately conservative direction documented at script lines 168–175 — harm is a
   delivered issue staying open, recoverable by hand. In scope as a known trade-off, worth an explicit
   test so the boundary is frozen.
3. **🟡 Behaviour deltas vs the base script (regressions in the strict sense, unrealistic inputs).**
   Derived from the base regex at `073af118:150` (`\b(...)\b[^#]*#([0-9]+)`), whose `[^#]*` matched
   these; the head script does not close them:
   - `Closes#150` (no separator) → nothing closed.
   - `` `Closes #150` `` inside a code span, and inside a fenced block → **closes** (probe rows
     `inside-code-span`, `fenced-code-block`). Not a bug, just unpinned.
   - `Closes [#150](https://x/y)` (markdown link) → nothing closed (base closed it).
   Each is non-idiomatic; #466's stated rule is "keyword immediately before the reference", so these
   are acceptable. No test needed.
4. **🟡 Pre-existing number-shape looseness (identical at base, so not a #466 regression).**
   `Closes #12abc` → closes **12**; `Closes #150.5` → closes **150**; `Closes #99999999999999999999`
   / `Closes #0` → issues with no fixture on the real API 404 → `state=unknown` → fail-open SKIP.
   Harmless in production, unpinned.

### Genuinely out of scope for #466 (no action)

`- Closes #150`, `> Closes #150`, `1. Closes #150`, `Closes : #150`, lowercase `closes:`, tab
separator, CRLF line endings, two refs on one line, duplicate refs, ref-then-foreign-mention,
multi-line bodies, `shouldn't`/`cannot`/`no longer` negators, negator three words out
(`does not close,` with punctuation) — all probed and behave sanely (see `probe-fixed.log`).
`Closes #0150` is a probe artifact (fixtures only existed for the candidate list); it is not a finding.
The same-number conservative rule (`"This does not close #150. Later text Closes #150."` → not closed)
is documented at script lines 171–174 but **untested** — 🟡, it silently defines the tie-break, so a
one-line test with that exact body would freeze it.

## 4. Non-findings (checked, no issue)

- Titles are never consulted: test lines 205–213 assert a `Closes #127` in the PR *title* closes
  nothing. Correct against `issues/${PR_NUMBER} '.body'`.
- Fail-open paths (`API down`, `close fails`, missing token, unmerged, dry-run parity,
  `EVENT_QUALIFIED`) all assert both the exit code and the guard reason, and never assert a close that
  did not happen. These all pass on the base script too, i.e. they are regression guards for #54 work,
  not #466 coupling.
- `.scratch/reviews/466/` is untracked scratch; no repo file outside that directory was modified.

## 5. Recommended follow-up (0 blockers, ~15 min of work)

1. Add to the #466 block in `scripts/ci/test-close-linked-issues.sh`: negated reference that lands
   after a line wrap (`$'This does not\nclose #150.'`) — expect no close.
2. Add the same-number tie-break body (`'This does not close #150. Later text Closes #150.'`) —
   expect no close, freezing the documented conservative rule.
3. Optionally add `'This not only fixes #150 but also tidies the hook.'` and document the 2-word
   negator boundary as intended, or widen the negation scope in a later issue.

VERDICT: NO BLOCKER
