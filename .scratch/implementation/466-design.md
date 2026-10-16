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
scripts/ci/test-close-linked-issues.sh  # 10 new assertions across 9 scenarios
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

### Negated closes (parent decision on #466)

`This does not close #443` is the same bug class as a mention, so it must extract
nothing. A second pass collects negated references and subtracts them from the
affirmative set. The affirmative pass is untouched, so nothing else about
extraction changes.

```bash
NEGATORS='(not|never|no longer|no more|won't|don't|doesn't|didn't|isn't|aren't|cannot|can't|no|hardly)'
\b${NEGATORS}([^[:alnum:]#]*word){0,3}[^[:alnum:]#]*${CLOSE_VERBS}${CLOSE_SEP}#[0-9]+
```

Four properties are deliberate:

- **Three words, and punctuation is allowed between them.** `does not, however,
  close #N`, `no intention of closing #N`, `does not, in any way, close #N` all
  negate (review finding C1). A `#` may not appear in the gap, so a negated
  reference can never swallow the reference after it.
- **Four words out is a different clause.** `Do not merge this until it
  Closes #N` still closes. Pinned from both sides (`#446` negates, `#135`
  closes).
- **`not only` / `not just` / `not merely` is affirmative.** Those matches are
  filtered back out before subtraction (review finding C2), as is a
  sentence-opening `No, ...` (`#457`).
- **Subtraction is by number, and conservative.** A body that both negates and
  closes the same number does not close it (`#456`). The safe direction: a
  missing close is visible, a wrong close is not.

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
| negator in a different clause | `Do not merge this until it Closes #135.` | closed (four-word gap is not a negation of this close) |
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

The gap tests and the negated-close tests are the regression pins: on the
pre-fix script the suite reports `PASS=58 FAIL=16` — 2 prose-gap closes, the
negated-close scenarios, the split-line/bold separators, and the mixed body. On
the fixed script: `PASS=74 FAIL=0`.

## Risks and non-goals

- **Subtraction is lossy in one direction only.** See the negated-closes section:
  a body that both negates and closes one number does not close it. That is the
  visible-failure direction (a missing close is noticed; a wrong close is not).
- A negated reference more than three words from its keyword is not treated as
  negating it, and a `not`/`no` that opens a separate clause can still swallow a
  following close within three words ("Not sure, but Closes #N" drops #N).
  Deliberate: the alternative drifts into sentence parsing, and the C1 review
  round chose to kill false closes over false drops.
- `Closes #12 and #13` still only extracts #12 — pre-existing, unchanged.
- `Closes - #N` (prose dash separator) no longer closes; it did at base only
  because the old gap matched anything. `Closes#N` never closed.
- A keyword in an HTML comment or a quote inside the body still counts. GitHub's
  own parser has the same property.
- No workflow-logic change, so no new failure mode on the merge path; the four
  existing fail-open guarantees (API failure, close failure, dry run, event
  qualification) are untouched.
