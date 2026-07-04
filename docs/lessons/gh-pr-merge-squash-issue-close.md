# `gh pr merge --squash` doesn't auto-close linked issues

## The problem

When merging a PR via `gh pr merge <num> --squash`, GitHub does **not**
automatically close the linked issue even when `Closes #<num>` is in the
PR body. The issue stays OPEN after the merge.

This is inconsistent with the GitHub UI merge button, which does trigger
auto-close for the same keyword.

## The fix

Always manually close the linked issue after merging:

```bash
gh issue close <num>
```

## Better — verify after every merge

```bash
# After merge
gh issue view <num> --json state
# If state: "OPEN", close it
```

## Root cause

The `gh pr merge` CLI tool creates a squash-merge commit via the API,
and the auto-close keyword detection works differently for squash merges
submitted programmatically compared to the web UI merge button.

## What to do on future PRs

1. Merge the PR
2. Immediately verify: `gh issue view <num> --json state`
3. If still OPEN: `gh issue close <num>`
4. Add a checklist item to the PR template to remind:
   `[ ] Verify linked issue is closed after merge`
