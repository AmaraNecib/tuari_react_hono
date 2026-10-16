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

New pattern:

```bash
\b(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)[[:space:]:]+#[0-9]+
```

- The keyword list is unchanged: `close/closes/closed/closing`,
  `fix/fixes/fixed/fixing`, `resolve/resolves/resolved/resolving`.
- `[[:space:]:]+` allows the separator forms GitHub accepts — `Closes #N`,
  `Closes: #N` — and nothing else: `Closes#N` matches nothing, prose after the
  keyword matches nothing.
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
nothing. A second pass collects negated references (`not` / `never` / `no longer`
/ contractions / `cannot`, up to two words before the keyword) and subtracts
them from the affirmative set:

```bash
\b(not|never|no longer|...)([[:space:]]+word){0,2}[[:space:]]+(close|fix|resolve)[[:space:]:]+#[0-9]+
```

The affirmative pass is untouched, so nothing else about extraction changes. Two
properties are deliberate:

- **Two words, no more.** `not going to close #N` is negated; a negator three
  words out is a different clause more often than a negated close, so
  `Do not merge this until it Closes #N` still closes.
- **Subtraction is by number, and conservative.** A body that both negates and
  closes the same number does not close it. Impossible wording in practice; the
  safe direction when it happens.

Forms that extract nothing now: `does not close #N`, `does not resolve #N`,
`never fixes #N`, `no longer closes #N`, `won't fix #N`, `cannot resolve #N`,
`not going to close #N`. Mixed bodies keep the affirmative side:
`This does not close #131, but Closes #132` → #132 only.

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
| negator in a different clause | `Do not merge this until it Closes #135.` | closed (three-word gap is not a negation of this close) |

The two gap tests and the six negation tests are the regression pins: on the
pre-fix script the suite reports `PASS=52 FAIL=8` — the two prose-gap closes plus
the six negated-close scenarios. On the fixed script: `PASS=60 FAIL=0`.

## Risks and non-goals

- **Subtraction is lossy in one direction only.** See the negated-closes section:
  a body that both negates and closes one number does not close it. That is the
  visible-failure direction (a missing close is noticed; a wrong close is not).
- `Closes #12 and #13` still only extracts #12 — pre-existing, unchanged.
- A keyword in an HTML comment or a quote inside the body still counts. GitHub's
  own parser has the same property.
- A negator more than two words from the keyword is not treated as negating it
  (`Do not merge this until it Closes #N` closes). Deliberate: the alternative
  drifts into sentence parsing, and over-dropping silently loses real closes.
- No workflow-logic change, so no new failure mode on the merge path; the four
  existing fail-open guarantees (API failure, close failure, dry run, event
  qualification) are untouched.
