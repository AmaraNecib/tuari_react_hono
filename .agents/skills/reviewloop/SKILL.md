---
name: reviewloop
description: "Record exact-head local review executions and bounded fix dispositions. Requires independent review, current-head 5/5 and no unresolved actionable findings."
---

# Local reviewloop

Policy: `docs/engineering-workflow.md`. Run on committed, source-frozen scope.
This skill records real reviews; it never creates a score from passing tests.

## Initial review

Use distinct read-only sessions for debate, test-audit and code-review.
Name exact base/head, spec, direct callers and the author account. Each session
returns actionable findings or a clean verdict with limits. The parent checks
the actual model/session IDs, source and report.

Luna is the ordinary explicit default. Optional OpenCode routes are not enabled
by the catalog and are not quota fallbacks. When no enabled non-author family
is available, use separate sessions under the owner's standing same-family
exception. Record actual identities and:

```json
{"independence":{"approvedBy":"owner","reason":"Standing owner approval: OpenCode unavailable; same-family separate-session review"}}
```

## Evidence record

Save an ignored `.scratch/reviews/<scope>/<HEAD>-reviewloop.json` containing
base/head, tier and named risk, author account, reviewer IDs/models and
executions, exact-tree reports, finding IDs/dispositions, remaining blockers,
independence disclosure and the reviewer's score. A required execution that
failed to start or could not read source is missing, not clean.

A local 5/5 requires a reviewer to explicitly assess the current source with
zero unresolved actionable findings. The parent does not manufacture 5/5
from silence, earlier scores or successful commands. Do not post, attach or
commit the record or reports.

## Bounded corrections

Verify findings against source. Commit related fixes, run affected proof and
send the combined delta plus prior reports to one fresh reviewer. It explicitly
carries unchanged conclusions forward and checks direct affected callers.
Rerun another lens only when the correction creates a named risk it covers.
A new head needs current-head evidence for the correction, not an automatic
restart of all initial lenses. After three rounds, reassess the design.

Never defer a real blocker to obtain 5/5. An accepted nonblocking follow-up
needs scope, reason, destination and reviewer acceptance, not just a score.

## Hosted boundary

Local readiness is not hosted acceptance. When publication is authorized,
retain configured hosted-review gates and request Greptile once per head.
Missing verdicts block merge, including exhausted credit. Never claim a local
report substitutes for the current-head hosted verdict or protected CI.
