# Code review — #466, range 073af118 → 978cf95b (two axes)

Reviewer: two-axis code reviewer (Standards + Spec), fresh context.
Skill: `.agents/skills/code-review/SKILL.md`.
Head: `978cf95b64b24685ae0ace598ae5d25e60a51ac2`; base `073af118d4f10dd1e7c4099a36a228b2035b00bb`.
Commits in range: `4ab192b5`, `03fa67b5`, `f64292ec`, `978cf95b`.

Note: the child could not write this file (tool budget); the parent persisted it
verbatim from the child's returned artifact. Nothing else in it was edited.

**Verdict: NO BLOCKER** — every #466 criterion and the parent's negation rule is implemented; the head's claimed fixes C1–C4 and ST1 hold against the current code.

## Evidence run

| command | result |
| --- | --- |
| `timeout 900 bash scripts/ci/test-close-linked-issues.sh` | exit 0, **PASS=74 FAIL=0** (log `.scratch/reviews/466/978cf95b-tests.log`) |
| `bash -n scripts/ci/close-linked-issues.sh` / `test-close-linked-issues.sh` | both OK |
| `bash -x <script>` with stub `curl` on PATH | printed post-expansion grep invocations (below) |
| `probe()` = real script + stub `curl` + one-line `PR_BODY` | extraction table below |
| `git diff 073af118...HEAD`, `git show --stat`, `git status --porcelain` | nothing staged |

### Shell passes exactly what the comments claim (`bash -x`, verbatim)

```
CLOSE_VERBS='(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)'
CLOSE_SEP='[*_]*([[:space:]]+|:)[[:space:]]*[*_]*'
NEGATORS='(not|never|no[[:space:]]+longer|no[[:space:]]+more|won[[:punct:]]?t|don[[:punct:]]?t|doesn[[:punct:]]?t|didn[[:punct:]]?t|isn[[:punct:]]?t|aren[[:punct:]]?t|cannot|can[[:punct:]]?t|no|hardly)'
+ grep -oiE '\b(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)[*_]*([[:space:]]+|:)[[:space:]]*[*_]*#[0-9]+'
+ grep -oiE '\b(not|never|no[[:space:]]+longer|no[[:space:]]+more|won[[:punct:]]?t|…|no|hardly)([^[:alnum:]#]*[[:alnum:]_'-]+){0,3}[^[:alnum:]#]*(close[sd]?|…|resolving)[*_]*([[:space:]]+|:)[[:space:]]*[*_]*#[0-9]+'
```

No globbing/word-splitting; `\b` and the POSIX classes survive. Both greps expand the *identical* verb alternation → **ST1 verified** for the verbs.

### Extraction probes

| body | extracted |
| --- | --- |
| `Closes #10` / `closes #10` / `CLOSES #10` / `Closes:#10` / `Closes   #10` | `#10` |
| `**Closes** #10` / `Closes **#10**` | `#10` (C3) |
| `the fix for #10` / `filed as #10` / `Part of #10` / `bare #10 here` | nothing |
| `Does not close #10` / `does not resolve #10` / `never fixes #10` | `Ignoring #10` (parent rule) |
| `This does not, however, close #10.` / `We have no intention of closing #10.` / `This does not, in any way, close #10.` | `Ignoring #10` (C1) |
| `This no longer closes #10.` / `won't fix #10` / `cannot resolve #10` / `not going to close #10` | `Ignoring #10` |
| `This not only fixes #10, it Closes #11.` | `#10` and `#11` (C2) |
| `No, this Closes #10.` / `Do not merge this until it Closes #10.` | `#10` |
| `Closes - #10` | nothing |
| `Not sure, but Closes #10.` | `Ignoring #10` — documented false-drop |

## Claim verification (checked, not assumed)

| claim | verdict | evidence |
| --- | --- | --- |
| C1 punctuation negation | fixed | `([^[:alnum:]#]*[[:alnum:]_'-]+){0,3}` :180; tests #444/#445/#446 |
| C2 "not only" affirmative | fixed | `grep -viE … (not|never)[[:space:]]+(only|just|merely|simply)` :182; tests #448/#449 |
| C3 emphasis + newline separators | fixed | `CLOSE_SEP` :167, `body_flat=$(… tr '\n' ' ')` :173; tests #450/#451/#452, #447 |
| C4 log only on real subtraction | fixed | `grep -qx "$neg"` guard :186-191; tests #454/#455 |
| ST1 verbs single-sourced | partly | verbs ✅ :164; extractor chain still duplicated :175-177 / :183-185 |

## Spec axis — criterion → pinning test

| criterion | test | status |
| --- | --- | --- |
| keyword immediately before reference | #122 L193, #1220 L198, #124 L208 | tested |
| `Closes`/`Fixes`/`Resolves` | #124/#125/#126 L208-222 | tested |
| optional `:` | #126 L218 | tested |
| **case-insensitive** | — | **no test (S1)** |
| bare `#N` never closes | #123 L203 | tested |
| `filed as #N` / `Part of #N` never close | #120 L182, #121 L188 | tested |
| title-only never closes | #127 L225-231 | tested |
| merged + open required | #102, #115/#116, #117 (pre-existing) | tested |
| parent: `does not close #N` | #128 L235 (+ echo) | tested |
| parent: `does not resolve #N` | #129 L242 | tested |
| parent: `never fixes #N` | #130 L247 | tested |
| negation doesn't kill another close | #131/#132, #133/#134, #454/#455 | tested |

Spec findings: **S1** case-insensitivity is a stated criterion with no test (behaviour correct by probe). **S2** four doc-claimed negation spellings (`no longer closes`, `won't fix`, `cannot resolve`, `not going to close`) plus `Closes:#N` probe correct but unpinned. **S3** no scope creep; the four pre-existing guards are byte-identical to base.

## Standards axis

Correct: `tr` is **not** a new dependency (base already used `tr -d '#'` and `tr '[:lower:]'`), so the curl+jq/no-`gh` contract is intact; all regexes are double-quoted at the call site (proved by the `bash -x` expansion); `bash -n` clean; `\b`/`[[:punct:]]` fine on GNU grep; script header rule 1 (:28-31) matches code (:158, :163-191) and the workflow header defers to it; no comment overclaims ("up to THREE words" = `{0,3}`; "a `#` cannot appear in the gap" true; "verbs defined once" true).

Findings: **ST1** residual Duplicated Code — extractor chain `grep -oE '#[0-9]+' | tr -d '#' | sort -un` at :175-177 and :183-185. **ST2** (note, pre-existing, untouched lines) `# MUST stay self-hosted (issue #54)` directly above `runs-on: ubuntu-latest`. **ST3** (note, process) design-pass evidence is `4ab192b5-design-pass.md` only; no `<HEAD>-design-pass.md` for `f64292ec`/`978cf95b` despite both changing the matcher (docs/engineering-workflow.md:211-213, :375).

## Design doc vs code

True: the `CLOSE_SEP`/negator properties, "TITLE still never read", "everything downstream untouched", `Closes - #N` no longer closes, and **`PASS=74 FAIL=0` reproduced exactly**. **D1 (minor)**: line 36 `# 10 new assertions across 9 scenarios` is stale — the doc's own table lists 26 scenarios and the suite runs 74 assertions. Not independently reproduced: `PASS=58 FAIL=16` on the pre-fix script (sibling lane's base run was still mid-suite; 74−16=58 is consistent). The `Not sure, but Closes #N` false-drop is real and already documented in the doc's risk section.

## Blocker check

All criteria implemented (two coverage gaps); all four claimed fixes verified; adjacency + number subtraction is strictly tighter than base; 74/74 with the untouched guards green.

**Verdict: NO BLOCKER**

Follow-ups, smallest first: (1) case-insensitivity test; (2) pin the four doc-claimed negation spellings; (3) design-doc line 36; (4) hoist the extractor chain; (5) `<HEAD>-design-pass.md`.
