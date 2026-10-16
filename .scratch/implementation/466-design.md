# Auto-close workflow: a mention is not a close — design

Ticket: `#466` (GitHub issue, body read via `gh issue view 466`).
Base SHA: `073af118d4f10dd1e7c4099a36a228b2035b00bb` (`origin/develop`).
Mode: remote repo, local-only delivery (this lane never pushes or opens a PR).
Branch: `fix/466-autoclose-workflow`.
Review tier: Standard (CI script + workflow).

## Problem

`scripts/ci/close-linked-issues.sh` is the only thing that closes issues on
merge into `develop` (GitHub's native auto-close only fires on the default
branch). Its reference extractor was:

```bash
grep -oiE '\b(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)\b[^#]*#([0-9]+)'
```

`[^#]*` let ANY amount of prose sit between the keyword and the reference. So
PR #442, whose body said the review "found and **fixed** a shared control ... is
**filed as** #443" (one line, ~200 chars apart), closed #443 — an issue that was
only announced as a follow-up. The same matcher closed #453. Meanwhile real
closes (#436, #440) did not land, so the failure is visible in both directions.

The matcher cannot tell "this PR delivers #N" from "this PR talks about #N". The
only signal that does is the convention `AGENTS.md` states: the keyword bound to
the reference, `Closes #N` / `Fixes #N` / `Resolves #N`, versus `Part of #N` or a
bare mention.

## Shape

One-line change of the extraction contract, plus the tests that pin it:

```
scripts/ci/close-linked-issues.sh       # extractor: keyword must be ADJACENT to #N
scripts/ci/test-close-linked-issues.sh  # regression matrix, 91 assertions
.github/workflows/auto-close-issues.yml # header rule restated (no logic changed)
```

New pattern (verbs defined once, used by both passes):

```bash
CLOSE_VERBS='(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)'
CLOSE_SEP='[*_]*([[:space:]]+|:)[[:space:]]*[*_]*'
\b${CLOSE_VERBS}${CLOSE_SEP}#[0-9]+
```

- The keyword list is unchanged: `close/closes/closed/closing`,
  `fix/fixes/fixed/fixing`, `resolve/resolves/resolved/resolving`.
- `CLOSE_SEP` requires at least a space or a `:` (so `Closes#N` matches
  nothing) and allows only markdown emphasis around it, never prose —
  `Closes #N`, `Closes: #N`, `**Closes** #N`, `Closes **#N**` all count.
- Newlines are joined before matching (`tr '\n' ' '`), so a keyword and its
  reference on separate lines still count — and a negation split across lines
  still negates. grep is line-based and cannot see either otherwise.
- `\b` still blocks mid-word matches (`unresolved #5`, `hotfix #5`).
- TITLE is still never read: the workflow passes the PR body from context, and
  the dispatch path fetches `GET /issues/N` → `.body` only.

Everything downstream is untouched, including the two guards that already
existed and are *not* the fix: the `remaining/todo #N` issue-body guard and the
`Part of #N` self-reference PR-body guard. `Part of #N` stops closing anything
twice over now — the extractor never sees it, and the self-reference guard would
still catch a body that says both (`Closes #201 — Part of #201`).

### Negated closes (parent decision on #466, rescoped by #486)

`This does not close #443` is the same bug class as a mention, so it must extract
nothing. A second pass collects negated references and subtracts them from the
affirmative set. The affirmative pass is untouched, so nothing else about
extraction changes.

The negator must reach the close verb **inside one sentence**. Two review rounds
of token patches (`{0,3}` words, then contractions, then the `\b` placement,
then markdown emphasis) each fixed one body and broke another, because a word
count is not a clause. The window is now structural:

```bash
body_sentences=$(printf '%s' "$body_flat" | tr '.!?;' '\n\n\n\n')
NEGATED_CLOSE="${NEGATOR}[^#]*${CLOSE_VERBS}${CLOSE_SEP}#[0-9]+"
```

- **A sentence ends at `. ! ? ;`.** A negator in one sentence cannot reach a
  close verb in the next, and vice versa. `Neither reviewer objected. Closes #N`
  closes; `This does not, in any way whatsoever, close #N` negates. Under the
  word count both of those were wrong, in opposite directions.
- **No word-count window.** Inside a sentence the gap holds any amount of prose
  and punctuation, bounded only by the next `#` — so a negation still swallows
  only the reference it directly precedes (`does not close #A, but Closes #B`
  still closes #B).
- **Every negator alternative carries its own trailing separator.**
  `\bno\b[[:space:]]+` — so `Nobody`, `Note:` and the interjection `No,` are not
  negators, and markdown between `no` and its object
  (`no **intention** of closing #N`) can no longer defeat the word test by
  sitting between the word and its `\b`.
- **Contractions are enumerated** (`hasn't`, `haven't`, `hadn't`, `won't`, …)
  because `grep -E` has no lookaround; `hasn't fixed #N` and `has not fixed #N`
  now agree.
- **`not only` / `not just` / `not merely` is affirmative — per matched span.**
  The check runs on the span the negator actually covers, not on the whole line,
  so `not only does not fix #N` keeps its negation while `not **only** fixes #N`
  closes. The old line filter threw away the whole span, negation included.
- **Subtraction is by number, and conservative.** A body that both negates and
  closes the same number does not close it (`#456`). The safe direction: a
  missing close is visible, a wrong close is not.

Known trade, accepted in #486: a negator and a close verb in the SAME sentence
negate, so `Do not merge this until it Closes #N` is now a logged, recoverable
drop (`Ignoring #N: the PR body negates closing it`) instead of a close. Comma-
separated clauses are the same sentence, so `Not sure, but Closes #N` is the
same class of conservative miss — visible in the run log and the step summary,
correctable by hand.

Negated candidates are recorded in the step summary as `SKIP` as well as echoed
to the run log; they used to vanish from the summary table.

Forms that extract nothing now: `does not close #N`, `does not resolve #N`,
`never fixes #N`, `no longer closes #N`, `won't fix #N`, `cannot resolve #N`,
`does not, however, close #N`, `no intention of closing #N`, `not going to
close #N`, and a negation split across a line break. Mixed bodies keep the
affirmative side: `This does not close #131, but Closes #132` → #132 only.

## Tests

Existing scenarios keep running; added (each one is a real-world shape):

| Scenario | Body | Expected |
| --- | --- | --- |
| #442 regression (long prose gap) | `...found and fixed a shared control, and a separate empty-state issue is filed as #122.` | not closed |
| short prose gap | `This PR documents the fix for #1220 in the changelog.` | not closed |
| `filed as #N` | `A related finding is filed as #120 — it is not delivered here.` | not closed |
| `Part of #N` only | `Part of #121 — the extraction lands in a follow-up PR.` | not closed |
| bare mention | `Follow-up wiring is tracked in #123.` | not closed |
| `Closes #N` | `Closes #124` | closed |
| `Fixes #N` | `Fixes #125` | closed |
| `Closes:`/`Resolves: #N` | `Resolves: #126` | closed |
| title-only `Closes #N` | body has no keyword, fixture PR carries `title: "Closes #127"` | not closed |
| negated close | `This does not close #128 — the work is still open.` | not closed, `Ignoring #128` echoed |
| negated resolve | `The shared primitive does not resolve #129 on its own.` | not closed |
| negated fix (`never`) | `Refactoring the hook never fixes #130.` | not closed |
| mixed, negated first | `This does not close #131, but Closes #132.` | #131 not closed, #132 closed |
| mixed, negated second | `Closes #133. It does not fix #134.` | #133 closed, #134 not closed |
| negator in a different clause | `Do not merge this until it Closes #135.` | not closed, `Ignoring #135` echoed (#486 trade: documented, recoverable drop) |
| negated, punctuation gap (C1) | `This does not, however, close #444.` | not closed |
| negated, bare `no` (C1) | `We have no intention of closing #445.` | not closed |
| negated, three-word gap (C1) | `This does not, in any way, close #446.` | not closed |
| negated across a line break | `This does not\nclose #447.` | not closed |
| `not only` is affirmative (C2) | `This not only fixes #448, it Closes #449.` | #448 and #449 closed |
| bold keyword (C3) | `The constraint is satisfied. **Closes** #450.` | closed |
| bold reference (C3) | `Closes **#451**.` | closed |
| keyword/reference split (C3) | `Closes\n#452.` | closed |
| negated + affirmative in one body | `This does not close #454. Closes #455.` | #454 not closed (reported), #455 closed |
| negation and close of one number | `Closes #456, though this does not close #456.` | not closed (conservative) |
| sentence-opening `No,` | `No, this Closes #457.` | closed |
| real negation after `No,` (BLOCKER, round 2) | `No, this does not close #460.` | not closed |
| contraction negation after `No,` | `No, it doesn't fix #470.` | not closed |
| `Note:` is not the negator `not` | `Note: this Closes #458.` | closed |
| a word starting with `no` is not a negator | `Nobody closes #459, it is still open.` | closed |
| contraction not-only (C2 round 2) | `This doesn't just fix #462, it closes it.` | closed |
| case-insensitive keyword | `CLOSES #463` | closed |
| remaining negation spellings | `no longer closes #464` / `won't fix #465` / `cannot resolve #468` / `not going to close #469` | not closed |
| nor-clause, both references (round 3) | `This does not close #471, nor does it resolve #472.` | both not closed |
| neither/nor (round 3) | `Neither fixes #473 nor closes #474.` | both not closed |
| affirmative beside a nor-clause (anti-vacuity) | `This does not close #471, nor does it resolve #472. Closes #480.` | #480 closed, exit 0 |
| no-space colon separator | `Closes:#481` | closed |
| not-only then a real negation (round 2) | `This not only does not fix #490, it makes it worse. Closes #491.` | #490 not closed, #491 closed |
| not-only contraction then a negation | `This not only doesn't fix #492, it makes it worse. Closes #493.` | #492 not closed, #493 closed |
| negative contractions, both spellings | `This hasn't fixed #494 yet, and it has not fixed #495 yet. Closes #496.` | #494/#495 not closed, #496 closed |
| negative contraction, `haven't` | `We haven't resolved #497 yet. Closes #498.` | #497 not closed, #498 closed |
| `no` + markdown emphasis | `We have no **intention** of closing #499. Closes #500.` | #499 not closed, #500 closed |
| `not **only**` is affirmative | `This not **only** fixes #501, it also improves performance. It does not fix #502.` | #501 closed, #502 not closed |
| negator in an earlier sentence (#486) | `Neither reviewer objected. Closes #503.` | closed |
| negation padded past three words (#486) | `This does not, in any way whatsoever, close #504. Closes #505.` | #504 not closed, #505 closed |
| negated candidate in the step summary | `This does not close #507. Closes #508.` with `GITHUB_STEP_SUMMARY` set | summary carries `SKIP … #507` and `CLOSED … #508` |

The gap tests and the negated-close tests are the regression pins. With the
74-assertion suite the pre-fix script reported `PASS=58 FAIL=16` (2 prose-gap
closes, the negated-close scenarios, the split-line/bold separators, the mixed
body); the 84-assertion control run against the base script is PENDING A SLOT
(the machine is CPU-bound and the owner's policy forbids re-running suites for
it). The round-1 fixed script: `PASS=91 FAIL=0`. After the #486 rescope the
suite is 110 assertions: `PASS=110 FAIL=0` at the round-2 code HEAD, and the
same suite against the 8b2504e2 (word-count) script is recorded in
`<head>-control-wordcount.log` — the round-2 rows are exactly the ones that
fail there, which is what makes them non-vacuous.

## Risks and non-goals

- **Joining newlines makes a hard-wrapped mention a close.** `…the earlier PR
  closes\n#150 was reopened…` closes #150, because the keyword and the reference
  are adjacent once the lines are joined. The same sentence on one line has
  always closed (base did it too, and so does GitHub's own parser), so the
  change makes a line-break body behave like a one-line body rather than
  inventing a new class. It is the direct cost of the C3 fix.
- **A negator inside an unrelated COMMA clause can still swallow a following
  close** (`Not sure, but Closes #N` drops #N). Deliberate, and the direction is
  safe: a missed close is visible in the log and the step summary, a wrong close
  is not. Splitting on `,` instead of `. ! ? ;` would break
  `This does not, however, close #N`, which is a real negation — the two cases
  are indistinguishable on surface tokens, so the matcher stays conservative.
- **Only whole-word negators count.** `Note:` and `Nobody` do not negate
  (`\bnot\b` / `\bno\b[[:space:]]+`), so `Note: this Closes #N` closes.
- **Subtraction is lossy in one direction only.** See the negated-closes section:
  a body that both negates and closes one number does not close it. That is the
  visible-failure direction (a missing close is noticed; a wrong close is not).
- `Closes #12 and #13` still only extracts #12 — pre-existing, unchanged.
- `Closes - #N` (prose dash separator) no longer closes; it did at base only
  because the old gap matched anything. `Closes#N` never closed.
- A keyword in an HTML comment or a quote inside the body still counts. GitHub's
  own parser has the same property.
- No workflow-logic change, so no new failure mode on the merge path; the four
  existing fail-open guarantees (API failure, close failure, dry run, event
  qualification) are untouched.
