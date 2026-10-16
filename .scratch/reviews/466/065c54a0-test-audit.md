# Test audit — issue #466 (auto-close workflow), head `ac6e55dd`

- **Worktree:** `D:/projects/tuari_react_hono/worktrees/fix-autoclose-workflow`
- **Range:** base `073af118` → head `ac6e55dd` (rounds: `4ab192b5` adjacency, `f64292ec` negation, `978cf95b` hardening, `a1ff2466` whole-word + round-2 fixes, `ac6e55dd` nor/neither)
- **Artifact under audit:** `scripts/ci/test-close-linked-issues.sh` (88 assertions) driving `scripts/ci/close-linked-issues.sh`
- **Round diff:** `NEGATORS` gains `nor|neither` (`scripts/ci/close-linked-issues.sh:174`) + 4 assertions (`scripts/ci/test-close-linked-issues.sh:388–401`)
- **CPU policy honoured:** no suite executed this round. Evidence is the test file, the source regexes, and the existing records: `.scratch/reviews/466/a1ff2466-probe.log` (pre-fix probe at `a1ff2466`), `f64292ec-test-audit.md`, `978cf95b-test-audit.md`. Suite result at this head recorded as `PASS=88 FAIL=0`.
- **Auditor:** test-audit (assertion-quality check, pre-fix falsifiability, gap analysis, matrix-health judgement)

---

## Verdict

**NO BLOCKER.** The 4 added assertions are real regression guards: they assert the *side effect*
(the fake-curl PATCH that writes `$TMP/closed_$N`), not log text, and the pre-fix probe at
`a1ff2466` records both nor-clause rows as `MISMATCH` `got=yes` — i.e. the pre-fix script really
PATCHed #232 and #240. The `nor`/`neither` change itself is sound for #466's contract.

Two non-blocking findings: a **vacuity gap** in the new block (no `check … "$RC"` and no paired
must-close, unlike the round-2 equivalents), and a **false-drop class** that the same pre-fix probe
recorded as `MISMATCH` and no round has addressed (`#242/#243/#245`, §2.2). The matrix is still
strong enough to call #466 done; the next *matching* finding should trigger a clause-based rewrite
of the negator rather than a sixth bolt-on (§3).

---

## 1. The 4 new assertions (#471–#474): side effect, not log

### 1.1 They assert the effect — confirmed

```bash
# scripts/ci/test-close-linked-issues.sh:55-62  (fake curl)
PATCH:issues/*)
  [[ "$path" =~ issues/([0-9]+) ]] && num="${BASH_REMATCH[1]}"
  echo closed >"$TMP/closed_$num"          # ← only writer of closed_$N
  printf '%s' '{"state":"closed"}'

# scripts/ci/test-close-linked-issues.sh:116-117
assert_closed()     { check "$1 closed #$2"     "yes" "$([ -f "$TMP/closed_$2" ] && echo yes || echo no)"; }
assert_not_closed() { check "$1 did NOT close #$2" "no"  "$([ -f "$TMP/closed_$2" ] && echo yes || echo no)"; }
```

All 4 new assertions are `assert_not_closed` (lines 393, 394, 400, 401) → they read
`$TMP/closed_471|472|473|474`, which is written **only** by the `PATCH:issues/*` branch. A pass
means the script did **not** issue the PATCH. No log grep is involved; wording of
`"Ignoring #N"` cannot make these pass. The new block adds no `assert_has`, so it is
side-effect-only (good).

### 1.2 They would FAIL on the pre-fix head `a1ff2466` — proven by the recorded probe

`.scratch/reviews/466/a1ff2466-probe.log` — extractor section, verbatim:

```
X7 does not close #231, nor does it fix #232         num=[232] neg=[231]
X8 No, this never fixes #239 nor closes #240.        num=[240] neg=[239]
```

`num=` is the set the affirmative pass extracts (what actually gets PATCHed); `neg=` is what the
negation pass subtracts. On `a1ff2466` the second reference lands in `num` and **not** in `neg` —
`nor` is absent from `NEGATORS` (the removed line in this commit's diff:
`NEGATORS='(not|never|no[[:space:]]+longer|…|hardly)'`).

`.scratch/reviews/466/a1ff2466-probe.log` — end-to-end section (real script + fake curl, `got=` read
from `closed_$N`), verbatim:

```
HUNT nor-clause 1st                                          #231   expect=no  got=no  rc=0 OK
HUNT nor-clause 2nd (pre-existing?)                          #232   expect=no  got=yes rc=0 MISMATCH
HUNT No, never fixes … nor closes 1st                        #239   expect=no  got=no  rc=0 OK
HUNT No, never fixes … nor closes 2nd                        #240   expect=no  got=yes rc=0 MISMATCH
```

That is the pre-fix record: on `a1ff2466` the probe's `#232` and `#240` rows are MISMATCH with
`got=yes rc=0`, i.e. a real PATCH fired and the script exited cleanly. The new tests are the same
shape, so on `a1ff2466`:

| new assertion (head) | body | pre-fix outcome |
|---|---|---|
| `#471` | `"This does not close #471, nor does it resolve #472."` | OK (`not` negates 471 — row `#231` precedent) |
| `#472` | same body | **FAIL** (`nor` not a negator → 472 PATCHed — row `#232` precedent) |
| `#473` | `"Neither fixes #473 nor closes #474."` | **FAIL** (`neither` not a negator → 473 PATCHed; no `#473` row exists, but `NEGATORS` on `a1ff2466` provably lacks `neither`) |
| `#474` | same body | **FAIL** (both the missing `neither` and the missing `nor`; row `#240` precedent for `nor … closes`) |

`resolve` vs the probe's `fix` is not a gap: `CLOSE_VERBS` covers both
(`close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving`, script line ~161), and the
newline-flattened body keeps keyword and reference adjacent with only a space separator, so the
affirmative pass extracts 472 on pre-fix exactly as the probe's X7 row did. **Falsifiability: OK.**

*(Caveat, stated plainly: the `a1ff2466` probe rows are the recorded evidence for the nor verb
`fix`; the `resolve` spelling and both `neither` assertions are reasoned from the regex, not
executed this round, per the CPU policy. The mechanism is identical — one token in one alternation.)*

### 1.3 Round-2 precedent for the same class of hole

`978cf95b-probe-base.log` / `978cf95b-test-audit.md` show the pre-existing pattern for the round-2
change (16 base failures, 14 of them wrongful closes). `ac6e55dd` follows the same shape: 1 regex
token + paired assertions, each failure attributable to the named hole. Nothing this round touches
the adjacency pass, the tie-break, the echo path, or the guard logic, so no previously-failing
assertion can silently change side.

---

## 2. Gaps

### 2.1 New block has no positive control and no exit-code check (🟡, fix if cheap)

`scripts/ci/test-close-linked-issues.sh:388–401` adds 4 assertions that all expect *no* effect.
There is no `check "… exits 0" "0" "$RC"` in that block (compare line 238: the round-1 negation
block opens with `check "negated run exits 0" "0" "$RC"`, and lines 229/422/430 repeat the idiom),
and no affirmative close inside the same body (compare `#131`/`#132` and `#454`/`#455`, which pair a
must-close with a must-not-close *in one body* precisely so a dead extractor cannot satisfy the
test).

- **Real risk?** Low but real. A regression that stops the *affirmative* pass from matching this
  body shape (`X. <verb> #N` after a comma) would make all 4 assertions pass while nothing closes.
  A broken `NEGATORS` regex is caught (it would leave 471/472 in `num`), and a total extractor
  failure is caught by the happy-path assertions, so the blast radius is narrow. Still, this is the
  only round whose new block has no anti-vacuity control at all.
- **Test warranted (exact):**

```bash
reset_state
mk_issue 471 open "nor clause, first reference"
mk_issue 472 open "nor clause, second reference"
mk_issue 475 open "affirmative control"
run_script "This does not close #471, nor does it resolve #472. Closes #475."
assert_not_closed "the negated first reference never closes (#471)" 471
assert_not_closed "the nor-clause reference never closes (#472)" 472
assert_closed "the affirmative close in the same nor body still fires (#475)" 475
check "nor-clause run exits 0" "0" "$RC"
```

- **Expected outcome at this head (static):** 471 no, 472 no, 475 **yes**, rc 0. The negation match
  cannot cross a `#` (the gap class `[^[:alnum:]#]*` forbids it), so `Closes #475` stays
  affirmative. Worth re-confirming the `#475` expectation when a suite slot is available.
- Cost: 4 lines, 0 new fixtures beyond #475.

### 2.2 False drops of *real* closes in a following clause (🟠, pre-existing, unpinned, out of #466 scope)

The same `a1ff2466` probe recorded these as MISMATCH and no round has addressed them — the probe log
rows are verbatim:

```
DROPCAND No changes needed elsewhere; Closes                 #242   expect=yes got=no  rc=0 MISMATCH
DROPCAND There is no bug; this Closes                        #243   expect=yes got=no  rc=0 MISMATCH
DROPCAND No - it Closes                                      #244   expect=yes got=yes rc=0 OK
DROPCAND Not sure, but Closes                                #245   expect=yes got=no  rc=0 MISMATCH
```

Cause, from the source: the negation pass (`scripts/ci/close-linked-issues.sh`, `negated=$(…)`) is a
**proximity window** — `\b${NEGATORS}\b([^[:alnum:]#]*[[:alnum:]_'-]+){0,3}[^[:alnum:]#]*${CLOSE_VERBS}…`
— with no clause boundary. `"No changes needed elsewhere; Closes #242"` is `no` + 3 filler words
(`changes`, `needed`, `elsewhere;`) + `Closes #242` → subtracted. `ac6e55dd` only adds
`nor|neither` to that alternation, so these rows are unchanged at this head.

- **Real risk?** Yes, 🟠 — a delivered issue silently stays open (recoverable by hand, and the
  conservative direction #466 explicitly chose for the *ambiguity* case). These are not ambiguity:
  the body contains an unambiguous affirmative close. No test pins them, deliberately, because the
  current behaviour is the bug.
- **Test warranted (exact), if the false-drop is fixed:**

```bash
reset_state
mk_issue 242 open "negator in a different clause"; mk_issue 245 open "negator then a close"
run_script "No changes needed elsewhere; Closes #242."
assert_closed "a negator in a different clause does not swallow the close (#242)" 242
run_script "Not sure, but Closes #245."
assert_closed "prose 'Not sure, but Closes #N' still closes (#245)" 245
```

- **Scope:** out of #466's stated contract (never close on a mere mention; respect an explicit
  negation; 4-word gap is a different clause). Should be its own follow-up, not a 6th bolt-on here.
  Note this is the *same root cause* as the nor hole that was just fixed — §3.

### 2.3 `nor`/`neither` widen the false-drop window (🟡, static read, not executed)

Adding two high-frequency conjunction words to `NEGATORS` widens the class in 2.2 to
`"neither X nor Y"` prose. By the regex window: `\bnor\b` + `the`(1) + `tests;`(2) + `this`(3) then
the close verb → an affirmative close is subtracted.

- **Body / expected if this is considered a bug:**
  `run_script "Neither the docs nor the tests were touched; Closes #242."` → `assert_closed 242`.
- **Real risk?** 🟡. The direction is a missed close, not a wrongful one, and the phrasing is
  plausible but not common in PR bodies. Not a regression against `073af118`? It is a *new* shape
  only in the sense that `nor`/`neither` are new words; the mechanism is the pre-existing window.
  Worth at most one assertion, and only if the rewrite in §3 is deferred.
- Not executed this round (CPU policy); derived by reading the pattern at
  `scripts/ci/close-linked-issues.sh:174` and the `negated=` pipeline.

### 2.4 Known residuals from the pre-fix probe, still unpinned (🟡, documented)

```
RESIDUAL hard-wrapped mention (known N6)                     #223   expect=no  got=yes rc=0 MISMATCH
RESIDUAL narrative past tense (known N7)                     #224   expect=no  got=yes rc=0 MISMATCH
```

- N6 (`"the bug that the earlier PR closes\n#223 was reopened"`): after the `978cf95b` newline join
  this still extracts `closes #223`, so it closes. Low harm in practice — a mention of a bug that a
  previous PR closed.
- N7 (`"PR #41 closed #224 prematurely; this reopens it."`): `close[sd]?` matches the past-tense
  narrative. Harm is bounded: #224 is already closed, and the script's own state gate
  (`if [ "$state" != "OPEN" ]`) SKIPs it. Worth pinning only if a wrongful PATCH on a closed issue
  ever has a side effect.
- Both flagged in earlier rounds as known/accepted; **out of scope** for this commit. No test
  warranted.

### 2.5 Not inspected this round

The workflow YAML that invokes `close-linked-issues.sh` (permissions, `PR_BODY` wiring, event
filters) was not re-read in this audit (budget). Previous audits covered the script-level contract;
if any #466 criterion is defined at the workflow level rather than the script level, it is not
covered by this matrix. Flagging rather than asserting.

---

## 3. Is the matrix done, or a pile of special cases?

**Done for #466's contract — but at the inflection point.** Judgement, with the evidence:

**Still a good matrix, do not rewrite the harness.**
- It drives the **real** script behind a fake `curl`; only the network is faked. No logic is
  mocked, and assertions are on side effects (`closed_$N`), not logs.
- All 4 new assertions are falsifiable against a recorded pre-fix head (§1.2), and the earlier
  rounds are proven the same way (base `PASS=58 FAIL=16`, all failures #466-family,
  `978cf95b-test-audit.md §1`). The gate is real (`[ "$FAIL" -eq 0 ]`).
- Zero duplicate coverage: the 4 assertions cover 2 distinct mechanisms (`nor` after a comma,
  `neither … nor`), each 2 references.

**The accretion is in the *matcher*, not the tests.** Each round bolted one token onto one
alternation: adjacency → negation pass → subtract-by-number → `not only/just` escape hatch → `\b`
whole-word → `nor|neither`. The thing being accumulated is the proximity-window heuristic, and it is
now the source of both a fixed hole (`nor #B`) and an unfixed one (`#242/#243/#245`, §2.2). Reading
the three regexes together (`CLOSE_VERBS`, `CLOSE_SEP`, `NEGATORS` at `close-linked-issues.sh:161–174`)
the whole matcher is ~4 lines; the *tests* are 501 lines. That ratio is fine — but the next matching
finding should change the *mechanism*, not the alternation:

- Recommended follow-up (own issue, ~1–2 h + one suite slot): split the flattened body on clause
  boundaries (`.`, `;`, `,`, `but`, `nor`) and evaluate negation **per clause**, so "a different
  clause" stops being a word count. That single change would delete the 3-word window, the
  `not only/just` special case, and the §2.2 false drops, while the existing 88 assertions act as
  the regression net. Verdict on *this* round: keep going with tests, but stop adding negator words.

**Residual risk of calling it done now:** the 471/472/473/474 assertions cannot fail if the
affirmative pass silently stops matching this body shape (§2.1); that is the only defect found, it is
4 lines to fix, and it does not affect the correctness of the fix under audit.

---

## 4. Recommended follow-ups (0 blockers)

1. 🟡 Add the paired must-close (`#475`) + `check "nor-clause run exits 0" "0" "$RC"` to the
   `ac6e55dd` block (§2.1). 4 lines, no new fixtures.
2. 🟠 File a follow-up for the clause-local false drops (§2.2) with the exact bodies above; prefer
   the clause-split rewrite (§3) over another negator/proximity tweak.
3. 🟡 If the rewrite is deferred, pin the `neither X nor Y; … Closes #N` shape (§2.3) as a known
   limitation or fix.

## 5. Non-findings (checked, no issue)

- No log-only close assertion was added; the 4 new assertions are side-effect reads.
- The new tests add no fixture-state leakage: each of the two blocks calls `reset_state` first, and
  the fixtures (#471–#474) are distinct from every other number in the file.
- Test names quote their bodies accurately and carry both the behaviour clause and the fixture
  number; no mislabelled counts (no "N-word" claim in this round's names to get wrong).
- `resolve` is a real close verb (`CLOSE_VERBS`), so the #472 body exercises the intersection of
  the close-verb set and the new negator set — the right pair to test.
- Only files under `.scratch/reviews/466/` were written by this audit; nothing else was modified,
  staged, committed, pushed, or merged.

VERDICT: NO BLOCKER

## Post-evidence delta — `065c54a0`

Reviewed code: `ac6e55dd`. The only later commit, `065c54a0`, is test-only +
design-doc: `scripts/ci/close-linked-issues.sh` is byte-identical to the reviewed
`ac6e55dd`, so this audit's verdict stands for `065c54a0`.

Both 🟡 gaps this audit raised are now closed by that test-only commit:

- §2.1 anti-vacuity: `Closes #480` now rides in the same body as the nor-clause,
  with a `check` on the run's exit code.
- `Closes:#N` (no-space colon) is now asserted (`#481`).

Suite at `065c54a0`: `PASS=91 FAIL=0` (single run, filtered output). The 🟠
pre-existing false-drop class (`#242`/`#243`/`#245`, "neither reviewer
objected"-shaped bodies) is unchanged by this delta and is the proposed
sentence-scoped follow-up, not a silent deferral. Pre-fix control for the
91-assertion suite: PENDING A SLOT (owner's CPU policy).
