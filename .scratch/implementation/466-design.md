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

The two gap tests are the regression pins: on `HEAD` (pre-fix script) the suite
reports `PASS=48 FAIL=2`, both failures being the prose-gap closes. On the fixed
script: `PASS=50 FAIL=0`.

## Risks and non-goals

- **Negated phrasing is still matched.** `This does not close #443` extracts
  #443 and would close it. Out of the ticket's stated scope (it names bare `#N`,
  `filed as #N`, `part of #N`); the adjacency fix does not make it worse. Note to
  the parent: candidate follow-up, decide separately.
- `Closes #12 and #13` still only extracts #12 — pre-existing, unchanged.
- A keyword in an HTML comment or a quote inside the body still counts. GitHub's
  own parser has the same property.
- No workflow-logic change, so no new failure mode on the merge path; the four
  existing fail-open guarantees (API failure, close failure, dry run, event
  qualification) are untouched.
