# Code review — #466 at `ac6e55dd` (Standards + Spec)

Reviewer: two-axis code reviewer (Standards + Spec), fresh context.
Skill: `.agents/skills/code-review/SKILL.md`.
Head: `ac6e55dd4301999c639ac3e2e977fc9941b05c10`; base `073af118`.
Commits in range: `4ab192b5`, `03fa67b5`, `f64292ec`, `978cf95b`, `a1ff2466`, `ac6e55dd`.
Prior round: `.scratch/reviews/466/978cf95b-code-review.md` (NO BLOCKER, 5 follow-ups).

**Verdict: NO BLOCKER.** Both round-2 fixes are present in the code (verified, not read from
commit messages); of the prior round's 5 follow-ups, 3 are DONE (`a1ff2466`: case-insensitivity
test, the four negation spellings, extractor-sites), 1 PARTIAL (design doc — fixed at `a1ff2466`,
re-staled by `ac6e55dd`), 1 NOT DONE (`<HEAD>-design-pass.md`). The four round-3 tests are real
and the suite arithmetic cross-checks to `PASS=88`. Three doc/test-coverage items remain, all minor.

## Evidence run (CPU policy respected — no suite run)

| command | result |
| --- | --- |
| `bash -n scripts/ci/close-linked-issues.sh` | syntax OK |
| `bash -n scripts/ci/test-close-linked-issues.sh` | syntax OK |
| `git diff --stat 978cf95b..HEAD` | 3 files, +119/−24 |
| `git log --oneline 073af118..HEAD -- <file>` | attribution table below |
| `grep -nE 'CLOSE_VERBS=\|CLOSE_SEP=\|NEGATORS=\|grep -oiE\|grep -viE'` | expansion below |
| `grep -oE 'assert_[a-z_]+' \| sort \| uniq -c` | 76 helper call sites → 88-assertion cross-check |
| `bash scripts/ci/test-close-linked-issues.sh` | **NOT RUN** — forbidden by CPU policy; head result recorded as PASS=88 FAIL=0 |

## Follow-up verification (round N-1 report → now)

| # | follow-up | status | commit | evidence |
| --- | --- | --- | --- | --- |
| 1 | case-insensitivity test | **DONE** | `a1ff2466` | `test-close-linked-issues.sh:366` `assert_closed "case-insensitive 'CLOSES #N' closes" 463`, body `run_script "CLOSES #463"` |
| 2 | pin the four documented negation spellings | **DONE** | `a1ff2466` | `:371` `no longer closes #464`; `:376` `Won't fix #465`; `:381` `cannot resolve #468`; `:386` `not going to close #469` — all `assert_not_closed` |
| 3 | design-doc staleness (line 36) | **PARTIAL** | `a1ff2466` fixed 74→84; `ac6e55dd` re-opened it | `.scratch/implementation/466-design.md:36` now reads `84 assertions`; `git log 073af118..HEAD -- .scratch/implementation/466-design.md` returns only up to `a1ff2466`, so the +4 assertions of `ac6e55dd` never reached the doc. Doc `:149` still `PASS=84 FAIL=0` |
| 4 | hoist the extractor chain (ST1, Duplicated Code) | **DONE** | `a1ff2466` | `close-linked-issues.sh:179-181` `to_numbers()`; both passes now call it (`:186`, `:209`). No copy of `grep -oE '#[0-9]+' \| tr -d '#' \| sort -un` remains in the extraction path |
| 5 | `<HEAD>-design-pass.md` | **NOT DONE** | — | `find .scratch/reviews -name '*design-pass*'` lists `466/4ab192b5-design-pass.md` only; no `a1ff2466-` or `ac6e55dd-` file exists. Process item, not a correctness item (see Note S3) |

## Round-2 / round-3 claims verified against code

| claim | verdict | evidence |
| --- | --- | --- |
| bare `no` now requires whitespace | **true** | `:173` NEGATORS contains `no[[:space:]]+` and **no bare `no\|` alternative**; `no[[:space:]]+longer` / `no[[:space:]]+more` still ordered before it |
| every negator wrapped in `\b` | **true** | `:207` `grep -oiE "\b${NEGATORS}\b(…)` — boundary on both sides of the whole alternation |
| the `No,` filter is gone | **true** | `:208` filter is now only `'\b([a-z]*n[[:punct:]]?t\|not\|never)[[:space:]]+(only\|just\|merely\|simply)\b'`; the old `^[[:space:]]*no[[:space:]]*,` alternative is deleted |
| contraction not-only filter | **true** | `:208` `[a-z]*n[[:punct:]]?t` matches `doesn`+`'`+`t`; pinned by `:360` `assert_closed "doesn't just fix #N" 462` |
| `nor` / `neither` added | **true** | `:173` `not\|never\|nor\|neither\|…`; pinned by `:393/#471`, `:394/#472`, `:400/#473`, `:401/#474` |
| PASS=88 at this head | **consistent** | helper call sites: `assert_closed` 25 + `assert_not_closed` 37 + `assert_has` 12 + `assert_not_has` 2 = **76**; minus the 4 added by `ac6e55dd` = 72 at `a1ff2466`; 84−72 = 88−76 = **12 direct `check` calls** — the doc's 84 and the parent's 88 agree exactly |

## Spec axis — #466 criterion → pinning assertion

| criterion (from `gh issue view 466` + parent negation rule) | pinning assertion | status |
| --- | --- | --- |
| keyword must sit immediately before the reference | `:195 #122`, `:200 #1220`, `:205 #123` | pinned |
| `Closes` / `Fixes` / `Resolves` | `:210 #124`, `:215 #125`, `:220 #126` | pinned |
| optional `:` separator | `:220 #126` (`Resolves: #126`) | partial — see S1 |
| case-insensitive matching | `:366 #463` (`CLOSES #463`) | **pinned (was S1 last round)** |
| bare `#N` never closes | `:205 #123` | pinned |
| `filed as #N` / `Part of #N` never close | `:185 #120`, `:190 #121` | pinned |
| title-only never closes | `:231 #127` (title fixture `:225-229`) | pinned |
| merged + open required | `:132 #102`, `:481 #114`, `:490 #115`, `:457 #117` | pinned (pre-existing) |
| parent: `does not close #N` negates | `:238 #128` (+ `:239` echo `Ignoring #128`) | pinned |
| parent: `does not resolve #N` negates | `:244 #129` | pinned |
| parent: `never fixes #N` negates | `:249 #130` | pinned |
| negation must not kill another close | `:255 #131`/`:256 #132`, `:262 #133`/`:263 #134`, `:324 #455`/`:325 #454` | pinned |
| no false close from prose (`the fix for #443`) | `:195 #122`, `:200 #1220` | pinned |
| documented negation spellings | `:371 #464`, `:376 #465`, `:381 #468`, `:386 #469` | **pinned (was S2 last round)** |
| round-2 BLOCKER bodies | `:339 #460`, `:344 #470` | pinned |
| whole-word negators (`Note:`, `Nobody`) | `:350 #458`, `:355 #459` | pinned |
| round-3 nor/neither hole | `:393-401 #471-474` | pinned |

Claimed-but-unpinned: **S1** — the no-space colon form `Closes:#N`, which `CLOSE_SEP` at `:165`
(`([[:space:]]+|:)`) explicitly allows, has no assertion (`grep -E 'Closes:#|Fixes:#|Resolves:#'`
→ none). Behaviour was probed correct last round; the criterion for `:` is only half-pinned.
**S2** — only `CLOSES` (all-caps) is pinned for case-insensitivity; mixed case (`Closes`, `closes`)
is exercised incidentally by other scenarios, which is adequate.
**S3** — no scope creep: the four pre-existing downstream guards are byte-identical to base.

## Standards axis

**Shell expansions match the header comments** (from `grep -nE`):

```
:161  CLOSE_VERBS='(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)'
:165  CLOSE_SEP='[*_]*([[:space:]]+|:)[[:space:]]*[*_]*'
:173  NEGATORS='(not|never|nor|neither|no[[:space:]]+longer|no[[:space:]]+more|no[[:space:]]+|won[[:punct:]]?t|don[[:punct:]]?t|doesn[[:punct:]]?t|didn[[:punct:]]?t|isn[[:punct:]]?t|aren[[:punct:]]?t|cannot|can[[:punct:]]?t|hardly)'
:185  grep -oiE "\b${CLOSE_VERBS}${CLOSE_SEP}#[0-9]+"
:207  grep -oiE "\b${NEGATORS}\b([^[:alnum:]#]*[[:alnum:]_'-]+){0,3}[^[:alnum:]#]*${CLOSE_VERBS}${CLOSE_SEP}#[0-9]+"
:208  grep -viE '\b([a-z]*n[[:punct:]]?t|not|never)[[:space:]]+(only|just|merely|simply)\b'
```

Correct:
- Both greps expand the **same** `CLOSE_VERBS`/`CLOSE_SEP` → ST1's duplication is gone (`:179`
  `to_numbers()`).
- `:170-172` comment ("trailing `\b` matters… bare `no` must be followed by whitespace…
  `nor`/`neither` are negators too") matches `:173` and `:207` exactly. The round-3 comment
  names the round-3 finding, so the header still states the rule the code enforces.
- Script header rule 1 (safety-rules block, "the keyword must come IMMEDIATELY before the
  reference (#466), and a NEGATED close … counts for nothing") is still true of `:183-219`.
- Workflow header agrees by **deferring**: `.github/workflows/auto-close-issues.yml:7-11` says the
  logic lives in the script and "this file deliberately does not restate them (they drifted apart
  once already)" — no second copy to drift.
- `bash -n` clean on both scripts; no new dependency (curl + jq unchanged, no `gh`).
- Deliberately conservative subtraction (`:213-217`) and the `grep -qx` guard (`:214`) unchanged —
  the C4 fix from round 1 survived the whole-word rewrite.

Note **ST-A** (minor, pre-existing): `no[[:space:]]+` as an alternative is only reachable when
followed by a word character, because `:207` appends `\b`; "no, x closes #N" therefore relies on
`\b`-before-`\b`-after semantics rather than a comma check. Behaviour is correct and pinned
(`:332 #457`, `:339 #460`); flagging only that the trailing-`\b` coupling is implicit.
Note **ST-B** (note, untouched): `# MUST stay self-hosted (issue #54)` sits directly above
`runs-on: ubuntu-latest`.
Note **ST-C** (process): follow-up 5 — no per-round `<HEAD>-design-pass.md` for `a1ff2466` or
`ac6e55dd` despite both changing the matcher, while sibling tickets (`465/design-pass.md`) and
round 1 of this ticket (`4ab192b5-design-pass.md`) followed the convention. I did not re-read
`docs/engineering-workflow.md` for the exact requirement under the CPU/budget limits, so this is
a Note, not a violation claim.

## Design doc vs code

True: the `CLOSE_SEP`/whole-word negator properties, the C1/C2 descriptions, "TITLE still never
read", "everything downstream untouched", the nor/neither-free risks already listed, and the
whole-word risk ("`Note:` and `Nobody` no longer negate"). Line 36's rewrite to "84 assertions"
was correct **at `a1ff2466`**.

Stale at `ac6e55dd`:

- **D1** `.scratch/implementation/466-design.md:36` — "84 assertions"; HEAD has 88 (76 helper
  call sites + 12 direct `check` calls; `ac6e55dd` added exactly 4).
- **D2** `:149` — "The fixed script: `PASS=84 FAIL=0`"; the recorded head result is 88/0.
- **D3** the negator list / scenario table has no `nor` / `neither` row and no `#471-474`
  scenario (`grep -n 'nor\|neither'` on the doc → none), even though `:173` now treats both as
  negators. The Risks section also omits the round-3 hole, so the doc reads as if `NEGATORS`
  were final at `a1ff2466`.
- Not a doc defect: `:145-147` keeps the base-control run honest ("PENDING A SLOT"), and the
  `Not sure, but Closes #N` false-drop is still documented in the Risks section.

## Blocker check

- Every #466 criterion is implemented and pinned; the only unpinned thing is the no-space colon
  form (S1), which is extra-parsing the issue did not demand.
- Both round-2 fixes are present in code at `:173`, `:207`, `:208` — confirmed by inspection of
  the file, not by the commit messages.
- Round-3 `nor`/`neither` fix is present at `:173` and pinned by 4 assertions.
- No regression surface: the extraction subtraction is strictly narrower than base; the four
  pre-existing guards are untouched; `bash -n` clean.

**Verdict: NO BLOCKER**

Follow-ups, smallest first:
1. Update the doc's three stale spots (D1 `:36`, D2 `:149`, D3 negator list + `#471-474` row) — ~5 minutes.
2. Pin `Closes:#N` (S1) with one `assert_closed` — ~2 minutes.
3. Add the `<HEAD>-design-pass.md` for the round-2/round-3 commits, or record in the ticket why
   the round-1 pass covers them (ST-C).

## Post-evidence delta — `065c54a0`

Reviewed code: `ac6e55dd`. The only later commit, `065c54a0`, is test-only +
design-doc: `scripts/ci/close-linked-issues.sh` is byte-identical to the reviewed
`ac6e55dd`, so both axes' verdicts stand for `065c54a0`.

This round's follow-ups are now all closed: the design-doc staleness fixed
(84→91, `NEGATORS` string, nor/neither rows), and the code-review item 5
(`<HEAD>-design-pass.md`) is written as `.scratch/reviews/466/065c54a0-design-pass.md`.
The one remaining unpinned form named here, `Closes:#N`, is now asserted (`#481`).
The 🟠 pre-existing false-drop class is the proposed sentence-scoped follow-up.
