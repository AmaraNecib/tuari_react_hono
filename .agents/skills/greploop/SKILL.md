---
name: greploop
description: "Resolve hosted Greptile feedback through GitHub PR comments and review threads. Never run the Greptile CLI."
license: MIT
metadata:
  author: greptileai
---

# Hosted Greptile review

Read `docs/engineering-workflow.md`. Use GitHub PR comments and review threads,
not the Greptile CLI. There is no local scoring loop or separate confidence
assessment. This skill grants no publication authority.

## Request and read

1. Confirm the repository, PR, intended base and current head. Only the
   authorized parent pushes, links and watches the PR; workers never publish.
2. Request Greptile through the GitHub PR comment mechanism once per pushed
   head. Check existing requests before posting. Use the repository's configured
   reviewer mention; do not guess a bot account or request duplicate reviews.
3. Read GitHub PR comments, reviews and inline review threads. Verify that the
   verdict covers the current head. A successful comment submission is not a
   completed review. Missing verdicts or exhausted credit block merge; do not
   repeat the request to spend more credit on the same head.
4. Verify findings against current source and direct callers. Fix valid
   findings with affected proof. Explain false positives with source evidence;
   never silently dismiss them or treat an outdated thread as resolved.
5. Commit named files for corrections. Follow the workflow's bounded delta
   review. After an authorized push, request review once for the new head.
   Require current-head Greptile 5/5 and no unresolved actionable findings.

Use GitHub tools or `gh api` to read and respond to feedback. Keep finding
replies in their existing threads where possible. Resolve a thread only after
verifying its fix. Never run `greptile review`, invoke `cli-review`, install
Greptile, or substitute a local result for the hosted verdict.

## Boundaries

Owner-requested local-only work stops at the local handoff: no push, request
comment, hosted review or claim of hosted acceptance. Do not fall back to a CLI
because publication is forbidden or a hosted verdict is unavailable.

Save operational records under ignored `.scratch/reviews/<scope>/` with exact
source SHA. Never commit, attach or post report files. Authorized review-request
comments and concise finding replies are not permission to publish local reports.

Check `CI acceptance`, effective protection, owner authority and issue
acceptance separately. This skill never authorizes merge or issue closure.
