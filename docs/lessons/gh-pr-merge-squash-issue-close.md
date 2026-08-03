# Issues never auto-close on merge — PRs target `develop`, not the default branch

## The problem

Every PR here merges into `develop`, but this repo's **default branch is `main`**.
GitHub only auto-closes issues when a PR is merged into the **default branch**.
So `Closes #<num>` in a PR title, body, or squash-merge message **never**
auto-closes the linked issue — regardless of where the keyword appears.

This has stranded many issues as OPEN after their work merged: #204, #195,
#206, #212, #215, #226, #227, and more. Each one had to be closed manually.

## Evidence

- `gh repo view --json defaultBranchRef` → `main`
- PRs target `develop` (see any `gh pr view <num> --json baseRefName`)
- Closed-by-PR issues show `closedByPRs: []` in `gh issue view` — they were
  closed manually, not by the merge

## The fix — manual close, every time

Always close the linked issue after merging a PR:

```bash
gh issue close <num> --comment "delivered by PR #<num> (commit <sha>)"
```

## Multi-PR issues — never close on the first PR

An issue can need **several PRs** to be fully delivered. Example: #177 needed
#179 (Phase 3) + #189 (ports-and-adapters) + #258 (Phase 4 debts). PR #179's
title said "closes #177" but the issue was NOT done yet — closing it then would
have lost the remaining scope.

Rules:

1. **PR convention** — a PR that delivers only PART of an issue must say
   `Part of #N`. Only the PR that finishes the issue says `Closes #N` / `Fixes #N`.
2. **Before closing**, check the issue body + the PR for `defer`/`follow-up`/
   `part of`/`remaining` references to **still-open** issues. If any exist,
   the issue is not done — leave it open.
3. **Check the acceptance criteria** are actually met in the code, not just
   claimed in the PR.
4. **Skip parents/trackers** with open sub-issues (maps, parent issues).

## Systemic fix

`auto-close-issues.yml` closes referenced issues on merge to `develop`, but is
conservative by design: it honors "Closes #N" only in the PR **body** (not
title), skips issues that defer to still-open issues, skips parents with open
sub-issues, and logs every SKIP with a reason. It is a convenience, not the
authority — the human/agent sweep still applies.

## Better — sweep after every batch merge

When several PRs merged (e.g. an agent batch), sweep all of them:

```bash
# 1. List merged PRs claiming to close issues
gh pr list --state merged --limit 15 --json number,title --jq '.[] | .title'

# 2. For each claimed issue, check state and close if OPEN
gh issue view <num> --json state   # if "OPEN" → close it
```

## Root cause (corrected)

Earlier versions of this file blamed `gh pr merge --squash` or the CLI. That was
**wrong**. The CLI behavior is identical to the web UI — the real cause is the
**branch target**: auto-close only fires on the default branch, and this repo's
default branch is `main` while all work merges to `develop`.

## Systemic fix (recommended)

Add a GitHub Action on `pull_request` events: when a PR targeting `develop` is
merged and its body/title matches `(closes|fixes|resolves) #(\d+)`, run
`gh issue close` for those numbers. This removes the manual step entirely.

## What to do on future PRs

1. Merge the PR
2. Immediately verify: `gh issue view <num> --json state`
3. If still OPEN: `gh issue close <num>`
4. Consider adding a checklist item to the PR template:
   `[ ] Verify linked issue is closed after merge`
