# CI-final activation

Status: **pending owner acceptance and enforcement**.

This branch defines a stable GitHub Actions `CI acceptance` check. It does not
change repository settings, publish a PR or establish successful hosted runs.
The last read of `develop` protection returned HTTP 404, Branch not protected.
No CI-final activation from AmaraNecib/dockan applies to this repository.

## Owner rollout

1. Review and accept this workflow-only change. Publish it only with explicit
   authority. Obtain the current-head local and hosted verdicts and a successful
   first `CI acceptance` run before treating the code as verified by CI.
2. Configure effective `develop` protection to require `CI acceptance` from
   GitHub Actions, app ID 15368, strict/up-to-date checks and administrator
   enforcement. Disable force pushes and deletions; configure no bypass.
3. Record the accepted protection response and owner decision locally.
   Verify the applied protection again, not just the historical comment.
4. After activation, each parent reads effective protection before relying
   on CI-final, and separately checks successful acceptance at the PR's current
   head before merge. A regression is an owner blocker, not a silent fallback
   to routine full local suites.

Read-only inspection:

```bash
gh api repos/AmaraNecib/tuari_react_hono/branches/develop/protection
gh pr view <number> --repo AmaraNecib/tuari_react_hono --json headRefOid,statusCheckRollup
```

Protection is an external owner action. Agents must not configure it, invent
its acceptance or use administrator bypass to claim this rollout complete.
Pending hosted checks do not stop focused implementation, local review or
authorized publication. They do stop merge.
