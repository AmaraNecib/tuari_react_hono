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
scripts/ci/test-close-linked-issues.sh  # regression matrix, 139 assertions
.github/workflows/auto-close-issues.yml # header rule restated (no logic changed)
```

New pattern (the closing reference is defined once, used by all three passes):

```bash
CLOSE_VERBS='(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)'
CLOSE_SEP='[*_]*([[:space:]]+|:)[[:space:]]*[*_]*'
CLOSE_REF="${CLOSE_VERBS}${CLOSE_SEP}#[0-9]+"   # the affirmative pass adds \b
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
body_sentences=$(printf '%s' "$body_flat" | sed -E 's/([.!?;])([[:space:]]+[^[:space:][:lower:]])/\1\n\2/g')
NEGATED_CLOSE="${NEGATOR}[^#]*${CLOSE_REF}"
```

- **A sentence ends at `. ! ? ;`** — but only when the next **non-space**
  character is not a lowercase letter. The bare `tr '.!?;'` version split inside
  tokens too (`per AGENTS.md,`, `e.g.`, `v1.2`, `...`), which moved the negator
  into a different "sentence" from its verb and turned a drop into a **close** —
  the direction that must never happen, and a regression against the round-1
  commit. The guard costs the safe direction instead: a sentence that opens
  with a lowercase word is not treated as a break, so a negation can reach
  further and drop a later close (logged, `Ignoring #N`). Pinned by
  `#510`/`#512`/`#513`/`#515`, which fail on the tr-split commit, and by
  `#522` (a double space is still one whitespace run, and a double space before
  an UPPERCASE word still ends the sentence — verified by probe, pinned only for
  the lowercase half) which fails there too.
  The class is locale-sensitive, and the exposure is the DANGEROUS direction:
  under `LC_ALL=C` an accented lowercase word is not `[[:lower:]]`, so the split
  happens where UTF-8 would keep one sentence and the negation is lost. Linux CI
  runs UTF-8, and the locale is not pinned, so this stays a documented caveat
  rather than a claim.
- **A negator in one sentence cannot reach a close verb in the next.**
  `Neither reviewer objected. Closes #N` closes;
  `This does not, in any way whatsoever, close #N` negates. Under the word count
  both of those were wrong, in opposite directions.
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
- **`not only` / `not just` / `not merely` / `not simply` is affirmative — per
  matched span.** The check runs on the span the negator actually covers, not on
  the whole line, so `not only does not fix #N` keeps its negation while
  `not **only** fixes #N` closes. The old line filter threw away the whole span,
  negation included.
- **Subtraction is by number, and conservative.** A body that both negates and
  closes the same number does not close it (`#456`). The safe direction: a
  missing close is visible, a wrong close is not.

Known trade, accepted in #486: a negator and a close verb in the SAME sentence
negate, so `Do not merge this until it Closes #N` is now a logged, recoverable
drop (`Ignoring #N: the PR body negates closing it`) instead of a close. Any
clause that never breaks the sentence is the same class — a comma clause
(`Not sure, but Closes #N`), a colon clause (`does not just run: it Closes #N`),
an unpunctuated one (`found no blockers, so Closes #N`) and a lowercase sentence
start. All are conservative misses: visible in the run log and the step
summary, correctable by hand.

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
| negated candidate in the step summary | `This does not close #507. Closes #508.` with `GITHUB_STEP_SUMMARY` set | #507 not closed, #508 closed, summary carries `SKIP … #507 … negates closing it` |
| negated-ONLY body (empty `numbers`) | `This does not close #509.` with `GITHUB_STEP_SUMMARY` set | nothing closed, early exit 0, summary still carries the `SKIP … #509` row |
| token-internal `.` (round-2 gate) | `This does not, per AGENTS.md, close #510. Closes #511.` | #510 not closed, #511 closed |
| abbreviation + ellipsis (round-2 gate) | `This does not e.g. fix #512, and it does not... close #513. Closes #514.` | #512/#513 not closed, #514 closed |
| version number (round-2 gate) | `This does not (see v1.2) fix #515. Closes #516.` | #515 not closed, #516 closed |
| `?` / `!` terminators (round-2 gate) | `Did you not read the issue? Closes #517. It was not fixed! Closes #518.` | both closed |
| `;` terminator (round-2 gate) | `The change is not related; Closes #519.` | closed |
| lowercase clause after a `;` (round-2 gate) | `The change is not related; this does not close #520. Closes #521.` | #520 not closed (control — passes on every baseline) |
| double space after a terminator (round-2 gate) | `This does not fix the parser.  closes #522. Closes #523.` | #522 not closed, #523 closed |
| CRLF body (round-2 gate) | `This does not close #524.\r\nCloses #525.` | #524 not closed, #525 closed |
| failed PR_BODY fetch | `fail_subs` on the PR number, no `PR_BODY` | exit 0, `nothing to close` |
| empty body | `PR_BODY=""` | exit 0, `nothing to close`, nothing closed |

The gap tests and the negated-close tests are the regression pins. With the
74-assertion suite the pre-fix script reported `PASS=58 FAIL=16` (2 prose-gap
closes, the negated-close scenarios, the split-line/bold separators, the mixed
body). The round-1 fixed script (`978cf95b`): `PASS=91 FAIL=0`. After the #486
rescope (`bfe4c50d`) the suite was 110 assertions at `PASS=110 FAIL=0`, with
`PASS=99 FAIL=11` against the round-1 word-count script.

After the two gate-fix commits the suite is 139 assertions: `PASS=139 FAIL=0`
at `<head>`. Three controls, all recorded in `.scratch/reviews/466/`:

| Control | Suite | Script | Result |
| --- | --- | --- | --- |
| word-count baseline | 139 | `8b2504e2` (word count) | `PASS=124 FAIL=15` — every #486 and round-2 pin |
| tr-split baseline | 139 | `bfe4c50d` (unconditional token split) | `PASS=134 FAIL=5` — `#510`/`#512`/`#513`/`#515`/`#522` |
| gate-fix baseline | 139 | `a1fd3f6d` (space-blind guard) | `PASS=138 FAIL=1` — the `#522` double-space row |

Three baselines because each fix answers a regression against the commit
before it: a test that only fails on the newer-of-two older scripts would not
prove the newer fix.

## Risks and non-goals

### Known remaining wrong-close classes (deferred, named — not silent)

Both are narrower than what this PR fixed, both are documented here so they are
not discovered as surprises, and each needs its own change rather than another
character-class patch:

1. **An abbreviation followed by a non-lowercase continuation still splits.**
   `This does not e.g. Fix #N` and `This does not e.g. **fix** #N` close #N,
   because the character after `e.g. ` is not lowercase. Telling `e.g.`/`i.e.`
   from a sentence end needs an abbreviation lexicon, not another case rule.
   Proposed follow-up: *auto-close: an abbreviation before a non-lowercase
   continuation defeats the sentence-scoped negation.*
2. **A negator does not reach a second close in an `or`-coordinated clause.**
   `This does not fix #A or resolve #B` closes #B, because `[^#]*` cannot cross
   the `#A`. Pre-existing since round 1 (identical at `8b2504e2`); the naive
   fix (allow `#` in the gap) breaks the pinned
   `does not close #A, but Closes #B` case. Proposed follow-up: *auto-close: a
   negator does not reach a second close in an `or`-coordinated clause.*

- **Joining newlines makes a hard-wrapped mention a close.** `…the earlier PR
  closes\n#150 was reopened…` closes #150, because the keyword and the reference
  are adjacent once the lines are joined. The same sentence on one line has
  always closed (base did it too, and so does GitHub's own parser), so the
  change makes a line-break body behave like a one-line body rather than
  inventing a new class. It is the direct cost of the C3 fix.
- **A negator inside an unrelated unbroken clause can still swallow a following
  close** (`Not sure, but Closes #N`, `does not just run: it Closes #N`,
  `found no blockers, so Closes #N`, and a sentence that opens with a lowercase
  word). Deliberate, and the direction is safe: a missed close is visible in the
  log and the step summary, a wrong close is not. Splitting on `,` instead of
  `. ! ? ;` would break `This does not, however, close #N`, which is a real
  negation — the two cases are indistinguishable on surface tokens, so the
  matcher stays conservative.
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
