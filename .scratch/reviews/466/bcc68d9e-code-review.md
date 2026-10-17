# Two-axis review — #466 / #486 at `bcc68d9e`

Gate SHA: `bcc68d9e` (branch `fix/466-autoclose-workflow`).
Delta reviewed: `git diff a1fd3f6d..bcc68d9e -- scripts/ci .scratch/implementation`
(3 files, +62/−18; commits `bcc68d9e` only).
Whole PR surface for context: `git diff origin/develop...HEAD` — 12 commits,
`scripts/ci/close-linked-issues.sh` (+142/−15) and
`scripts/ci/test-close-linked-issues.sh` (+444), plus `.scratch/reviews/466/*`
and `.scratch/implementation/466-design.md`.

Mode: read-only. No repo file edited, nothing staged (`git diff --cached` → 0),
no GitHub write. This report file itself is the only artifact written.

Evidence reused, not re-run (per the run's budget rule): the five recorded logs
in `.scratch/reviews/466/`. The 7-minute suite was **not** re-run; two cheap
offline probes were run (regex pipeline lifted from `close-linked-issues.sh`,
no network) — see "Probe runs" below.

---

## Verdict

- **Code at HEAD: clean.** The delta does exactly what it claims, in the safe
  direction, and is pinned by a row (`#522`) that fails on the immediately
  preceding commit. No false-CLOSE regression against `a1fd3f6d` found.
- **Docs at HEAD: one blocker + two accuracy defects.** The design doc's
  control table contradicts the recorded evidence for the tr-split baseline
  (a worktree-only edit already fixes it, uncommitted), the doc's own regex
  snippet still shows the pre-fix pattern the delta removed, and the doc's
  locale-direction claim is disproved by the code.
- **The two deferred wrong-close classes are real and reproduce at HEAD** (I
  reproduced both). Neither is severe enough to block this merge; class 2
  should get its follow-up issue filed before merge, because it is the
  realistic one.

---

## STANDARDS AXIS

Sources: `AGENTS.md` (staging + scratch lifecycle, lines 7, 15–16, 29–37),
`.agents/wisdom/{process,testing,security}.md` (read for relevance — nothing in
this delta touches security or process surfaces), `.gitignore:36–46`.

### Correct (with evidence)

- **`set -euo pipefail` interaction is sound for the changed line.**
  `close-linked-issues.sh:221` is a plain command substitution whose only
  failure mode would be a sed error; the ERE is valid, GNU sed handles the
  combined POSIX class `[^[:space:][:lower:]]` as a single bracket expression,
  and the input is already-flattened text. Pre-existing shape, not worsened by
  the delta. (The affirmative path `numbers=$(…)` carries `|| true`; the
  sentence path never did — noted, not a finding.)
- **Preflight message now matches the tool list and the header.**
  `close-linked-issues.sh:86` loops over `curl jq sed`; `:88` now says
  "needs curl + jq + sed", matching the header contract at `:22` ("Backend:
  bash + curl + jq + sed") and `:26-30` ("curl + jq + sed are the minimum
  guaranteed toolchain"). Before the delta the message named only curl + jq
  while the loop demanded sed — a real operator-confusion bug, fixed.
- **Quoting in the new test rows is correct.** `test-close-linked-issues.sh:594`
  passes the double space inside double quotes (preserved in shell);
  `:601` uses bash ANSI-C quoting `$'…\r\n…'` for the CRLF body, and `:602`
  asserts exit 0 (`RC`) so a CRLF-induced crash fails loudly instead of
  passing vacuously. Both rows executed and passed (`PASS=139 FAIL=0`,
  `bcc68d9e-tests.log`).
- **Comment-to-code accuracy for the code comments the delta touched.**
  `:207` now reads "the next NON-SPACE character is not a lowercase letter",
  which is what `:221` implements. `:204-206` ("those four characters also
  occur INSIDE tokens … splitting there moves the negator into a different
  'sentence' … turns a drop into a CLOSE") is accurate and explains the
  failure direction. The rename at `test-close-linked-issues.sh:585` fixes a
  label that claimed a `;`-clause negation was doing work it never did (the
  row passes on every baseline — now labelled "control").
- **No shell-portability regression.** The delta adds no new external tool,
  no non-POSIX construct beyond what the script already required (GNU sed
  `\n` in the replacement, `\b`/`-oE` in grep), and stays inside the runner's
  toolchain (`bash + curl + jq + sed`, no `gh`, issue #54).

### findings

1. **Minor — locale is unpinned, and the class is locale-sensitive.**
   `close-linked-issues.sh:221` uses `[[:lower:]]`; nothing in
   `scripts/ci/*.sh` or `.github/workflows/auto-close-issues.yml` sets
   `LANG`/`LC_ALL` (`grep -rn 'LC_ALL\|LANG=' scripts/ci .github/workflows/auto-close-issues.yml`
   → no matches). POSIX bracket expressions are LC_CTYPE-defined, so under a
   non-UTF-8 locale the guard suppresses fewer splits. Concrete trigger
   (verified, see Probe runs): `PR_BODY` = `This does not... évidemment close
   #604. Closes #605.` → under `LC_ALL=C` **#604 CLOSES** (`closed=[604 605]`,
   `negated=[]`), under `LC_ALL=C.utf8` #604 is correctly negated
   (`closed=[605]`, `negated=[604]`). Same body, opposite outcome.
   Same shape with an abbreviation instead of an ellipsis (`does not e.g.
   éliminer #N`). This is the wrong-close direction.
   Fix: `export LC_ALL=C.UTF-8` near the top of the script (or prefix the sed
   call), so behaviour does not depend on the self-hosted runner's locale.
   See Spec finding 3 — the doc asserts a property the code does not have.

2. **Note — this round's review evidence is untracked.**
   `git status` shows `.scratch/reviews/466/{a1fd3f6d,bcc68d9e}-*` as `??`,
   while `AGENTS.md:37` says `.scratch/reviews/<issue-id>/` is "**keep
   committed while the PR is open**" and `.gitignore:46` un-ignores that
   directory. Earlier rounds landed theirs in `docs(review)` commits
   (e.g. `8b2504e2`, `03fa67b5`), so this is the established in-flight state,
   not a new breakage — but the five logs this review relies on must land
   before the PR merges, or the SHA-vs-evidence check has nothing to match.

3. **Note — `AGENTS.md:7` ("never `git add -A`") is not violated.** The delta
   stages nothing; the design-doc edit currently in the worktree is unstaged.
   Whoever commits the doc fix must stage the single file explicitly.

Nothing else found on the standards axis.

---

## SPEC AXIS

Spec sources read: `gh issue view 466`, `gh issue view 486`,
`.scratch/implementation/466-design.md` (both the `bcc68d9e` version and the
worktree version).

### Acceptance criteria — #466

| Criterion | Status | Evidence |
| --- | --- | --- |
| Keyword must sit immediately before the reference; bare `#N`, `filed as #N`, `part of #N` never close | delivered | `close-linked-issues.sh:57-64` (`CLOSE_SEP` = emphasis + (`[[:space:]]+`\|`:`) + emphasis, no `[^#]*` gap); rows `#122`, `#1220`, `#120`, `#121`, `#123` in the suite |
| Case-insensitive, optional `:` | delivered | `grep -oiE` in the affirmative pass; rows `CLOSES #463`, `Closes:#481`, `Resolves: #126` |
| Titles never close | delivered | title-only `Closes #N` row; the workflow passes body only |
| Test proof for each named shape | delivered | 139 executed checks, `PASS=139 FAIL=0` (`bcc68d9e-tests.log`) |
| Negated close (`does not close #N`) must not close (parent decision on #466) | delivered | negated pass `:185`, `:250-262`; rows `#128`–`#130`, `#444`–`#447` |
| "Consider whether close requires merged PR + open issue" | delivered | state gate (`state != OPEN` → SKIP) plus `EVENT_QUALIFIED` merge qualification, unchanged by this delta |

### Acceptance criteria — #486

| Criterion | Status | Evidence |
| --- | --- | --- |
| Sentence scope, not a word count | delivered | `close-linked-issues.sh:221` splits on `.!?;`, negation pass is line-scoped by `grep`; the `{0,3}` window is gone |
| The two named zero-sum bugs fixed | delivered | `Neither reviewer objected. Closes #503` closes (row #503); `does not, in any way whatsoever, close #504` negates (row #504) |
| ~10 test rows + existing net | delivered | rows `#503`–`#509` plus the round-2 gate rows `#510`–`#525` |
| Pre-fix control re-recorded in one full-suite slot | delivered | `bcc68d9e-control-8b2504e2-wordcount.log` = `PASS=124 FAIL=15` |
| Known trade documented | delivered | `466-design.md` "Known trade, accepted in #486" + `#135` row |

### Round-2 delta (what this gate is on) — verified against the code

- `[^[:space:][:lower:]]` at `:221` makes the character after the **whole**
  whitespace run the test, matching the comment at `:207`. The listed
  regression is real: under `a1fd3f6d`'s space-blind `[^[:lower:]]`, the second
  space satisfied the class, so `This does not fix the parser.  closes #522.
  Closes #523.` split and #522 closed — the recorded
  `bcc68d9e-control-a1fd3f6d-spaceguard.log` shows exactly one failure, the
  `#522` row. At HEAD that row passes (probe: `closed=[523] negated=[522]`).
- The direction of the change is uniformly safe: a stricter guard means fewer
  splits, i.e. negation reaching further, i.e. more drops — never more closes.
  I looked for a new *undocumented* drop and found none: where a later
  affirmative close sits in the same un-split line, `[^#]*` in
  `NEGATED_CLOSE` still cannot cross an earlier `#A`, so
  `This does not close #A.  Closes #B.` keeps closing #B.
- The double-space row converts a CLOSE into a DROP (that is the fix, and the
  row asserts it); `#523` guards against a vacuous pass. Correct shape.

### findings

1. **Blocker (documentation, one line, already fixed in the worktree but not
   committed) — the doc's tr-split control row contradicts the recorded log.**
   `.scratch/implementation/466-design.md:218` (HEAD, i.e. `git show
   bcc68d9e:.scratch/implementation/466-design.md`) says:
   `| tr-split baseline | 139 | bfe4c50d (unconditional token split) | PASS=138
   FAIL=1 — the #510/#512/#513/#515 wrong-close rows |`
   The recorded evidence says otherwise:
   `bcc68d9e-control-bfe4c50d-trsplit.log` → `PASS=134 FAIL=5`, with the five
   failures being exactly `#510`, `#512`, `#513`, `#515` **and `#522`**:
   ```
   FAIL: a '.' inside a filename is not a sentence end (#510) did NOT close #510
   FAIL: 'e.g.' between negator and verb still negates (#512) did NOT close #512
   FAIL: an ellipsis between negator and verb still negates (#513) did NOT close #513
   FAIL: a version number between negator and verb still negates (#515) did NOT close #515
   FAIL: a double space after the terminator is not a sentence break (#522) did NOT close #522
   ```
   The row as written at HEAD also duplicates the gate-fix row's `PASS=138
   FAIL=1`, which is what `bcc68d9e-control-a1fd3f6d-spaceguard.log` actually
   shows. Effect: the doc's regression argument ("each fix answers a regression
   against the commit before it", `:220-222`) is unsupported at this SHA for
   the tr-split column, and the claim in the row text (`#510/#512/#513/#515`)
   omits the `#522` pin that is the point of the delta.
   Already corrected *in the working tree only* —
   `git diff HEAD -- .scratch/implementation/466-design.md` replaces the row
   with `PASS=134 FAIL=5 — #510/#512/#513/#515/#522` and the gate-fix row with
   `PASS=138 FAIL=1 — the #522 double-space row`. That edit must be committed
   (explicitly staged, per `AGENTS.md:7`) before this PR is considered done;
   until then the design record at the gate SHA misstates its own evidence.
   Code impact: none.

2. **Major — the doc's own regex snippet is the pre-fix pattern.** At `:79`
   (unchanged by the delta; same line in the worktree), the doc shows:
   ```
   body_sentences=$(printf '%s' "$body_flat" | sed -E 's/([.!?;])([[:space:]]+[^[:lower:]])/\1\n\2/g')
   ```
   That is the space-blind guard the delta removed. The code at
   `close-linked-issues.sh:221` is `[^[:space:][:lower:]]`, and the doc's own
   prose 4 lines below (`:83`) says "the next **non-space** character is not a
   lowercase letter". A decision record whose quoted snippet reintroduces the
   `#522` wrong close is a self-contradiction; anyone copying the snippet from
   the design doc re-opens the defect this gate exists to pin. Fix: update
   `:79` to the HEAD pattern.

3. **Major (spec) — the doc's locale-direction claim is false, and the code
   proves it.** `466-design.md:93-96`: "The class is locale-sensitive: under
   `LC_ALL=C` an accented lowercase word is not `[[:lower:]]` and the split
   happens anyway — Linux CI runs UTF-8, and the failure direction there is a
   drop, not a close." Two problems:
   - The direction claim is wrong. The split the C locale produces is
     dangerous precisely where the guard is *needed* — a terminator inside a
     token (abbreviation, ellipsis, version) — because splitting there loses
     the negation and the issue CLOSES. Verified: `This does not... évidemment
     close #604. Closes #605.` closes #604 under `LC_ALL=C`, negates it under
     `LC_ALL=C.utf8` (Probe runs). "Drop, not close" holds only for the case
     where the terminator is a genuine sentence end.
   - "Linux CI runs UTF-8" is an unverifiable assumption about the
     self-hosted runner (issue #54), and nothing in the repo pins the locale.
     The repo's own shell here already runs `LANG`/`LC_ALL` unset (C), i.e. the
     locale in which the false close reproduces.
   Fix: pin `LC_ALL=C.UTF-8` (preferred, removes the caveat entirely) or
   rewrite the sentence to state that the failure direction can be a close.

4. **Minor — `<head>` is left as a placeholder.** `:211`: "the suite is 139
   assertions: `PASS=139 FAIL=0` at `<head>`." The number is right
   (`bcc68d9e-tests.log` → `PASS=139 FAIL=0`), but the SHA is unfilled while
   the rest of the doc names SHAs. Replace with `bcc68d9e` so the doc's
   evidence pointer resolves.

### Numbers check (doc vs recorded evidence)

| Doc claim | Recorded evidence | Match |
| --- | --- | --- |
| 139 assertions, `PASS=139 FAIL=0` at `<head>` | `bcc68d9e-tests.log`: `PASS=139 FAIL=0` | yes |
| word-count baseline, 139, `8b2504e2`, `PASS=124 FAIL=15` | `…8b2504e2-wordcount.log`: `PASS=124 FAIL=15` (15 `FAIL:` lines) | yes |
| tr-split baseline, 139, `bfe4c50d`, `PASS=138 FAIL=1` | `…bfe4c50d-trsplit.log`: `PASS=134 FAIL=5` | **no** — blocker 1 |
| gate-fix baseline, 139, `a1fd3f6d`, `PASS=138 FAIL=1` | `…a1fd3f6d-spaceguard.log`: `PASS=138 FAIL=1` | yes |
| 110 assertions / `PASS=110 FAIL=0` at `bfe4c50d`, control `PASS=99 FAIL=11` | not re-verified (earlier-round log `bfe4c50d-control-wordcount.log` present; outside this delta) | not checked |

All four baselines sum to 139, so the row counts are internally consistent
apart from the one wrong cell.

### Deferred wrong-close classes — reproduced, and my severity call

Both are documented at `466-design.md:226-245`, each with a proposed follow-up
title. I reproduced both at HEAD:

- **Class 1 — abbreviation + non-lowercase continuation.**
  `This does not e.g. Fix #603.` → `sentences` = `This does not e.g.` /
  ` Fix #603.`, `closed=[603] negated=[]`. **#603 CLOSES.** Doc claim accurate.
  Follow-up named. My call: **not a merge blocker.** It needs the odd wording
  "does not e.g. <Verb>" between a negator and a close verb; the class is
  narrow and the lexicon fix is genuinely a separate change.
- **Class 2 — `or`-coordinated second close.**
  `This does not fix #601 or resolve #602.` → `closed=[602] negated=[601]`.
  **#602 CLOSES.** Doc claim accurate (pre-existing since round 1; the
  word-count baseline log's 15 failures contain no or-coordinated row, which is
  consistent with it being identical there, as the doc states). Follow-up
  named. My call: **not a blocker for this merge** (it is not a regression
  against `a1fd3f6d`), but it is the more plausible of the two in real bodies —
  "This PR does not fix #A or resolve #B" is ordinary PR prose — so the
  follow-up issue should be filed before merge rather than after.

### Probe runs (this review, offline, ~10s total)

Regex pipeline lifted verbatim from `close-linked-issues.sh:180-262` into
`/tmp/x.sh` and `/tmp/z.sh` (no network, no repo file written):

```
This does not fix the parser.  closes #522. Closes #523.
  sentences=$'This does not fix the parser.  closes #522.\n Closes #523.'
  closed=[523] negated=[522]          # delta behavior at HEAD — correct
This does not fix #601 or resolve #602.   → closed=[602] negated=[601]   # class 2
This does not e.g. Fix #603.              → closed=[603] negated=[]      # class 1
LC_ALL=C      This does not... évidemment close #604. Closes #605. → closed=[604 605] negated=[]
LC_ALL=C.utf8 This does not... évidemment close #604. Closes #605. → closed=[605]     negated=[604]
```

---

## Summary

- Standards axis: 1 minor finding (unpinned locale, `close-linked-issues.sh:221`),
  2 notes (untracked evidence, staging hygiene). No documented-standard
  violation in the delta; **clean** on shell portability, quoting, `set -euo
  pipefail`, the GNU-sed dependency, and comment-to-code accuracy for the
  comments the delta touched.
- Spec axis: 1 blocker (doc control table vs `…trsplit.log`, worktree fix
  uncommitted), 2 majors (stale regex snippet at `:79`; false locale-direction
  claim at `:93-96`), 1 minor (`<head>` placeholder at `:211`). Every `#466`
  and `#486` acceptance criterion is still delivered and pinned at HEAD.
  **Code clean; the doc needs the four edits above.**

Residual risks: (a) the design doc's evidence table is the artifact a future
reviewer trusts, and at the gate SHA it misstates the tr-split control, so the
per-commit regression argument is unproven until the worktree edit is committed;
(b) locale-dependence of the guard is unmitigated and, in the non-UTF-8 locale
present on this machine, produces a wrong close; (c) the two deferred classes
are reproduced and documented but unfiled as issues.
