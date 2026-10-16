# Test audit — issue #466 (auto-close workflow), head `978cf95b`

- **Worktree:** `D:/projects/tuari_react_hono/worktrees/fix-autoclose-workflow`
- **Range:** base `073af118` → head `978cf95b` (rounds: `4ab192b5` adjacency, `f64292ec` negation, `978cf95b` review hardening)
- **Artifact under audit:** `scripts/ci/test-close-linked-issues.sh` (74 assertions) driving `scripts/ci/close-linked-issues.sh`
- **Auditor:** test-audit (provable-claim check, new-assertion quality, untested-edge probe)
- **Evidence:** `.scratch/reviews/466/978cf95b-fixed.log`, `…-base.log`, `…-probe.sh`, `…-probe-head.log`, `…-probe-base.log`

## Verdict

**NO BLOCKER.** The claim "the suite pins the #466 behaviour and fails if the fix is reverted" is
**proven**: head → `PASS=74 FAIL=0` exit 0; same test file against the pre-fix script → `PASS=58
FAIL=16` exit 1. All 16 base failures are #466-family behaviour (adjacency / negation / newline-join
/ tie-break); **zero** unrelated or harness-coupling failures. All 14 assertions added this round are
correctly named and fail (or pass) for the right reason.

One **new, real, previously-unpinned regression** was found by probing (🟠, non-blocking): the
negation pass treats any word *starting* with `no` (`Note:`, `Now`, `novel`) as a negator, so
plausible affirmative bodies silently stop closing. Exact bodies and expected outcomes in §3.1.

## 1. Provable-claim check (executed)

```
bash scripts/ci/test-close-linked-issues.sh
  → PASS=74 FAIL=0  exit 0                      (.scratch/reviews/466/978cf95b-fixed.log)

R=$(mktemp -d); git show 073af118:scripts/ci/close-linked-issues.sh > $R/close-linked-issues.sh
cp scripts/ci/test-close-linked-issues.sh $R/; bash $R/test-close-linked-issues.sh
  → PASS=58 FAIL=16 exit 1                      (.scratch/reviews/466/978cf95b-base.log)
```

74 assertions run in both runs (74+0 = 58+16) — no assertion is skipped or short-circuited on base.

### Exact FAIL list on the pre-fix script, with attribution

| # | failing assertion | expected → actual | attribution |
|---|---|---|---|
| 1 | `prose keyword far from the reference … (#442 regression)` | no → **yes** | `4ab192b5` adjacency |
| 2 | `prose 'the fix for #N' never closes` (#1220) | no → **yes** | `4ab192b5` adjacency |
| 3 | `'does not close #N' never closes` (#128) | no → **yes** | `f64292ec` negation |
| 4 | `negation is echoed` (`Ignoring #128`) | yes → no | `f64292ec` negation |
| 5 | `'does not resolve #N' never closes` (#129) | no → **yes** | `f64292ec` negation |
| 6 | `'never fixes #N' never closes` (#130) | no → **yes** | `f64292ec` negation |
| 7 | `the negated reference in a mixed body is dropped (#131)` | no → **yes** | `f64292ec` negation |
| 8 | `a trailing negated close does not (#134)` | no → **yes** | `f64292ec` negation |
| 9 | `'does not, however, close #N' never closes` (#444) | no → **yes** | `978cf95b` punctuation gap |
| 10 | `'no intention of closing #N' never closes` (#445) | no → **yes** | `978cf95b` punctuation gap |
| 11 | `a three-word negator gap still negates (#446)` | no → **yes** | `978cf95b` punctuation gap |
| 12 | `a negated close split across two lines never closes` (#447) | no → **yes** | `978cf95b` newline join |
| 13 | `'Closes' on one line and '#N' on the next closes` (#452) | yes → no | `978cf95b` newline join |
| 14 | `the negated reference does not (#454)` | no → **yes** | `978cf95b` negation |
| 15 | `the subtracted candidate is reported` (`Ignoring #454`) | yes → no | `978cf95b`, finding C4 |
| 16 | `a body that both negates and closes one number does not close it` (#456) | no → **yes** | `f64292ec` subtract-by-number |

- **Nothing but #466 behaviour fails.** Filtering the FAIL lines for anything that is not a
  close/no-close or negation-echo assertion returns nothing. No `check "… exits 0"` /
  `check "… exits 1"` / guard-reason / summary / token assertion breaks on base, so the suite is
  **not** accidentally coupled to the fix.
- **14 of 16 failures are wrongful closes** (`expected: [no] / actual: [yes]`), i.e. the pre-fix
  script really PATCHed issues the PR only mentioned or explicitly refused. #13 is a false negative
  in base (no line joining); #15 is the missing subtraction log.
- **Real side-effect assertions, not log greps — confirmed.** `assert_closed`/`assert_not_closed`
  (test lines 116–117) test the existence of `$TMP/closed_$N`, and that file is written **only** in
  the fake-curl `PATCH:issues/*` branch (test lines 55–62). A pass therefore proves the HTTP PATCH
  happened, exactly the production effect. `assert_has`/`assert_not_has` log greps are always
  *additional* checks (e.g. the echo assertions), never the sole check for a close.
- **"Not closed" cannot be satisfied by a dead extractor in the mixed cases**: #131/#132, #133/#134
  and #454/#455 each pair a must-close with a must-not-close **inside one body**.
- **Control-command note (environment):** the prescribed `timeout 280` control was **truncated** on
  this machine (`EXIT=124`, log ends after `PASS: API-failure reason echoed`, 56 of 74 assertions).
  With two suites running concurrently each took ~5m03s wall clock; the same suite under `timeout 400`
  completed (head, `EXIT=0`). Use `timeout 400` (or run the suites serially) for this control —
  this is runner speed under Windows process-spawn overhead, not a script hang.

## 2. New-assertion quality (14 assertions, scenarios #444–#457)

| scenario | name → body | on base | right reason? | name accurate? |
|---|---|---|---|---|
| #444 | `'does not, however, close #N' never closes` → `"This does not, however, close #444."` | FAIL (yes) | ✔ affirmative pass extracts 444, negation pass must subtract it | ✔ quotes body verbatim |
| #445 | `'no intention of closing #N' never closes` → `"We have no intention of closing #445."` | FAIL (yes) | ✔ same path, `no` + 2 fillers | ✔ |
| #446 | `a three-word negator gap still negates (#446)` → `"This does not, in any way, close #446."` | FAIL (yes) | ✔ fillers = `in`, `any`, `way` = exactly 3 | ✔ **no repeat of the previous round's `three words` mislabel** |
| #447 | `a negated close split across two lines never closes` → `"This does not\nclose #447."` | FAIL (yes) | ✔ base is line-based → closes #447 | ✔ |
| #448 | `'not only fixes #N' is affirmative and closes (#448)` | PASS | ✔ base has no negation pass | ✔ |
| #449 | `the second close in the same body closes (#449)` | PASS | ✔ two-close extraction | ✔ |
| #450 | `'**Closes** #N' closes` → `"… **Closes** #450."` | PASS | ✔ base `[^#]*` swallows `**`; head via `CLOSE_SEP` emphasis | ✔ |
| #451 | `'Closes **#N**' closes` → `"Closes **#451**."` | PASS | ✔ | ✔ |
| #452 | `'Closes' on one line and '#N' on the next closes` | FAIL (no) | ✔ base cannot span the newline | ✔ |
| #454 | `the negated reference does not (#454)` (with #455 must-close in the same body) | FAIL (yes) | ✔ | ✔ |
| #455 | `the affirmative reference closes (#455)` | PASS | ✔ | ✔ |
| echo | `the subtracted candidate is reported` (`assert_has "Ignoring #454"`) | FAIL (no) | ✔ base has no subtraction path | ✔ |
| #456 | `a body that both negates and closes one number does not close it` | FAIL (yes) | ✔ documented conservative tie-break | ✔ |
| #457 | `a sentence-opening 'No,' does not negate the close (#457)` | PASS | ✔ base has no negation pass | ✔ |

- **6 of 14 pass on the pre-fix script by design** — they are anti-over-negation guards (the
  affirmative side). Each passes *for the right reason*: the pre-fix script closes everything it
  extracts, so it can only fail these if the fix over-negates. That is exactly their job.
- The 8 that FAIL on base all fail on the negation/newline-join path, each matching its name.
- **No mislabelled tests this round.** Verified the counts in every "N-word" name against the body
  text, and every `(#NNN)` suffix against the fixture number actually asserted.

## 3. Untested edges (probed with the real head script; `.scratch/reviews/466/978cf95b-probe*.log`)

Probe = the real `close-linked-issues.sh` per candidate body behind the fake curl, reporting which
numbers actually received a PATCH. Base column = same probe against `073af118`.

| edge | body | head result | base result | verdict |
|---|---|---|---|---|
| CRLF affirmative | `Closes #101\r\n` | closes 101 ✔ | closes 101 | **no risk** (correct) |
| CRLF negated + affirmative | `This does not close #102.\r\nCloses #103.` | 102 not closed, 103 closed ✔ | closed 102+103 | **no risk** (`\r` is in `[[:space:]]`) |
| `#` between negator and keyword | `See #104. This does not close #105.` | neither closed ✔ | closed 105 | **no risk** — `[^[:alnum:]#]` gap prevents swallowing; correct |
| **`no` as a substring** | see §3.1 | **affirmative closes LOST** ✖ | closed correctly | 🟠 **real risk, regression vs base** |
| `no` as interjection | `No, this Closes #124.` | closes 124 ✔ | closes 124 | covered by #457 |
| unicode separator | `Closes\u00a0#112` (NBSP) / `Closes\u2014#113` (em dash) | neither closed | both closed | 🟡 unpinned; NBSP defensible-but-silent, em dash correct; no test needed for #466 |
| very long single-line body | `Closes #119 ` + 100k `x` / 200k `x` | closes ✔ (rc 0, no hang) | closes | **no risk** (GitHub caps bodies at 65536 chars) |
| multiple keywords on one line | `Closes #114, Fixes #115, Resolves #116` | all three closed ✔ | all three | **no risk** (already partly pinned by the summary test) |
| body of only newlines | `\n\n\n` | rc 0, nothing closed, no crash ✔ | same | **no risk** |
| `Closes` with no space before `#` | `Closes#117` | not closed (deliberate, script comment) | closed 117 | 🟡 no behavioural risk; suite does not freeze it |
| colon with no space | `Closes:#118` | closes 118 ✔ | closes 118 | no risk (only `Resolves: #N` is pinned) |
| negator 4 words out | `Do not merge this until it Closes #122.` | closes 122 ✔ | closes 122 | pinned by #135 test |
| same-number negate+close | `Closes #123, though this does not close #123.` | not closed ✔ | closed 123 | **now pinned** (#456) |

### 3.1 🟠 Real risk — `no` matches the *prefix* of ordinary words (new false negative)

`NEGATORS` (script line ~178) is anchored only on the left (`\b${NEGATORS}`), so `no` matches the
first two letters of `Note`, `Now`, `Nothing`, `novel`, `notice`, …; the only `no`-safety filter
(script line ~184) removes `^[[:space:]]*no[[:space:]]*,` — i.e. a leading `No,` — not prefixes.

| exact body | head | expected | base |
|---|---|---|---|
| `"Note: this Closes #106."` | **not closed** (logged `Ignoring #106`) | closes #106 | closed #106 |
| `"Now the PR Closes #107."` | **not closed** | closes #107 | closed #107 |
| `"The novel approach Closes #111."` | **not closed** | closes #111 | closed #111 |

- **Right reason for the failure mode:** the body *does* contain an affirmative adjacent close, so
  the issue is genuinely delivered and the auto-close silently skips it. Harm = delivered issue
  stays open (recoverable by hand) — the documented conservative direction, but unlike #135/#457
  this is **not** the intended trade-off: `NEGATORS` is meant to match the word `no`, and the script
  comment ("bare `no` needs a word after it, not a comma") shows the author intended word-level
  semantics.
- **This is a regression against base** (base closed all three) introduced by `f64292ec`/`978cf95b`,
  and no assertion in the 74 covers it — every existing negation test uses `does not` / `never` /
  `no intention of` / `No,`.
- **Not a blocker for #466**: #466's contract (never close on a mere mention, respect an explicit
  negation) is met, and the failure direction is a missed close, not a wrongful one.
- **Suggested narrowing (not applied, not empirically verified):** add a right-hand word boundary —
  `\b${NEGATORS}\b` at the negation pass (script line ~181). `won't`/`can't`/`doesn't` still end on a
  word char, and `no longer` ends on `longer`, so the boundary holds for every alternative; the
  `Note`/`Now`/`novel` prefix matches disappear. Re-run the 74 assertions afterwards.
- **Test to add (exact):** `run_script "Note: this Closes #N."` → `assert_closed`.

## 4. Recommended follow-ups (0 blockers)

1. 🟠 File a follow-up for the `no`-prefix false negative (§3.1): narrow the negator with `\b` and add
   the `"Note: this Closes #N."` test. Cheap, one token + one assertion.
2. 🟡 Freeze two deliberate behaviours the suite leaves unpinned: `Closes#N` (no separator) must not
   close, and `Closes:#N` must close — both currently documented only in comments.
3. 🟡 Optional: pin NBSP-before-reference (`$'Closes\u00a0#N'`) to whatever behaviour is intended; it
   changed silently vs base.
4. Note for the runner: give the pre-fix control `timeout 400`, not 280 (§1).

## 5. Non-findings (checked, no issue)

- No test asserts on log text where a side effect is available; no log-only close assertions.
- No duplicate coverage added this round; the 14 new assertions probe 8 distinct behaviours
  (punctuation gap, 3-word gap, newline join, not-only/just, bold keyword, bold reference, C4 echo,
  conservative tie-break).
- Determinism: no network, no sleeps, `mktemp` sandboxes; two full runs (head, base) produced
  identical totals. No flake observed.
- The CI gate is real: last line `[ "$FAIL" -eq 0 ]` with observed exit 0 (head) / 1 (base).
- Only files under `.scratch/reviews/466/` were written by this audit; no repo file was modified.

VERDICT: NO BLOCKER
