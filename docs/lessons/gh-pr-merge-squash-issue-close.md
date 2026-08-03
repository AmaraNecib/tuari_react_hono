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
