## Greptile CLI has a 50-review trial cap. Budget it (Minor)
The local Greptile gate (`greptile review --json --branch <base>`) stopped mid-lane with
`error: you've used all 50 trial reviews for this account`. The trial quota is shared and
finite, so a lane that needs an iterative fix loop can exhaust it and cannot obtain a fresh
clean re-run.

**Always**: check `greptile whoami`/team quota before relying on repeat re-runs. Run the
cleanest single review per lane and leave re-verification budget for findings you fix. If the
cap is hit, keep the raw JSON of the review that ran, fix every actionable finding (verifying
each against current code), pinpoint each fix with a test, and flag the re-verification blocker
to the parent. Do not claim a clean verdict you could not obtain.

