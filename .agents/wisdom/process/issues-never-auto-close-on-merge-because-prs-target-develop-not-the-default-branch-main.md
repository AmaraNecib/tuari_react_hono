## Issues never auto-close on merge because PRs target `develop`, not the default branch `main` (🟠 Major)

PRs merge into `develop`, but GitHub's auto-close-on-merge fires **only for the
default branch** (`main`). So `Closes #N` in a PR title, body, or squash message
**never** closes the linked issue here, no matter where the keyword goes.
Evidence: #206 and #227 show `closedByPRs: []` despite being closed by merged
PRs (they were closed manually).

This repeatedly strands issues as OPEN after their work merged (#204, #195,
#206, #212, #215, #226, #227…).

**Always**: after merging a PR that claims to close an issue, run
`gh issue close <num> --comment "delivered by PR #<num>…"` immediately. When
syncing/batching merges, sweep every merged PR's claimed issue and close any
still OPEN. Do not trust the closing keyword. Verify `gh issue view <num> --json state`.

**Multi-PR issues (🟠 Major)**: an issue can need SEVERAL PRs to be fully
delivered (#177 needed #179 + #189 + #258; #179's first PR said "Closes #177"
but only did Phase 3). Never close an issue on the FIRST PR that mentions it.
Check the issue body and the PR for deferred/follow-up/part-of references to
still-open issues, and confirm the issue's acceptance criteria are actually
met before closing. PR convention: a PR that delivers PART of an issue must
say "Part of #N". Only the finishing PR says "Closes #N".

**Systemic fix (implemented)**: the `auto-close-issues.yml` GitHub Action closes
referenced issues on merge to `develop`, but is deliberately CONSERVATIVE. It
honors "Closes #N" only in the PR body (not title), skips parents with open
sub-issues, skips an issue whose body marks remaining work in a still-open
issue (`remaining`/`todo` ONLY), and skips when the PR body marks the number
being closed itself as partial (`Part of #N` where N is the target). Lineage
markers, "Part of #M" (M ≠ target), "follow-up from #N", "deferred from #N",
describe where an issue came from and NEVER block closing it. Every SKIP is
logged for human verification. It is a convenience, not the authority. The
manual sweep still applies.

