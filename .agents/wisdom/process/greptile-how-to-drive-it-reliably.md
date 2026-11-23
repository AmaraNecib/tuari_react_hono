## Greptile (external review bot): how to drive it reliably (🟠 Major)

`@greptile-apps review` re-triggers after a fix push. Reliable driving rules:

- **Base branch first**: `gh pr create` defaults to the repo DEFAULT branch
  (`main`), not `develop`. Greptile then diffs the wrong base, inflates file
  counts (539/682 files), and hits its 500-file ceiling. Always pass
  `--base develop`; fix an open PR with `gh pr edit <n> --base develop` and
  verify `gh pr view <n> --json baseRefName` before re-triggering (#194, #300).
- **Presence, not score**: read the inline comment (score + "Files Needing
  Attention") even when the check is green; a trial-quota review has only the
  upgrade prompt. Treat it as "Greptile unavailable", document on the PR, rely on
  the local review pipeline (debate/test-audit/code-review evidence).
- **Poll the check, not the comments**: after a fix push the old summary stays
  until the new review lands. Watch `gh pr checks` "Greptile Review" state
  (pending → pass), then read the newest summary (#258).
- **Re-trigger after workflow/docs pushes**: `.github/workflows/`, `.agents/`,
  `docs/` commits are reviewable. A ci.yml push makes the prior review stale;
  re-trigger before the pre-report gate (#206).
- **It can stall entirely**: the check can VANISH (not pending, not quota) with
  no review in ~30–40 min. Treat it as "Greptile unavailable"; verify the last
  review's findings are addressed, document the constraint, rely on local
  evidence (#268).
- **Whole-file review**: Greptile reviews the whole touched file, not just the
  diff. On a move/rename, skim the relocated file for pre-existing warts
  (duplicated blocks, nondeterministic order) and fix them in the move (#209).
- **CLI mode can flag PRE-EXISTING base-level items**: `greptile review --json
  --branch <pinned-base>` may report confidence <5 over a file the branch never
  touched (e.g. a retired self-hosted runner pool the base commit itself
  introduced). Verify scope with `git diff <base>..HEAD -- <flagged-file>`
  (empty diff = out of scope), record it as deferred work for the parent, and
  gate on the actual comments array — zero actionable comments on the diff is
  a clean verdict for the branch even when confidenceReasoning mentions a base
  concern (dynamic-ports lane).

