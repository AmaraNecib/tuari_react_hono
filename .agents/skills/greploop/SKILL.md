---
name: greploop
description: "Resolve Greptile findings against a pinned head. Hosted review is the scored gate; local CLI review runs only when explicitly requested."
license: MIT
metadata:
  author: greptileai
---

# Greptile finding resolution

Read `docs/engineering-workflow.md`. Greptile is the scored review gate when
publication is authorized. There is no mandatory local scoring loop or extra
confidence-assessment step. This skill grants no publication authority.

## Hosted review

1. Confirm the repository, intended base and current head. The authorized
   parent publishes, links and watches the PR; workers never publish.
2. Request Greptile once per pushed head. Do not request repeat reviews on the
   same head. A missing verdict or exhausted credit blocks merge; preserve the
   watch and report the blocker rather than retrying to spend more credit.
3. Read findings and threads, not just the status. Verify each claim against
   current source and direct callers. Fix valid findings with affected proof;
   explain false positives with source evidence rather than silently dismissing.
4. Commit named files for bounded corrections. Use the workflow's bounded
   delta review, not a restart of all initial lenses. A new head needs a new
   hosted verdict; never relabel old results as current.
5. Require current-head Greptile 5/5 and no unresolved actionable findings.
   Separately verify `CI acceptance`, effective protection, owner authority
   and issue acceptance. This skill never authorizes merge or issue closure.

No publication, hosted requests or comments run during an owner-requested
local-only task. Stop at the local handoff without calling it hosted acceptance.

## Optional local CLI review

Run only when the owner explicitly requests local Greptile review. Load
`cli-review` for its execution and authentication rules. Pin committed head and
base; the CLI does not review uncommitted files. Do not install packages or
start a paid review merely because a command is available.

Report the actual CLI verdict, findings and score if supplied. The result is
advisory, not an additional local 5/5 prerequisite or a substitute for hosted
acceptance. Do not automatically repeat the CLI until a score is reached.

Save reports under ignored `.scratch/reviews/<scope>/` with exact source SHA.
Never commit, post or attach reports. Preserve failed attempts and provenance.
A green command is not proof that findings were resolved.
