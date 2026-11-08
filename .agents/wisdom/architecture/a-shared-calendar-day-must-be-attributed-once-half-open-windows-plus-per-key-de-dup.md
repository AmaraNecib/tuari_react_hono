## A shared calendar day must be attributed once: half-open windows plus per-key de-dup (🟠 Major)

On #412 round 4, `deriveSalaryProjectDays` built each project's day set with an
inclusive loop (`for ms = start; ms <= end`). Moving a worker from project A to
project B ends one assignment and starts the other at the same instant, so that
calendar day was counted for both windows. For a 30-day March payment the scaled
split then summed to 31 days, which the dialog rejected as over-allocated until
someone corrected it by hand. Note the shape of the bug: the per-project sets
were individually correct; the failure was a *coverage total larger than the
period*, which inflated the scale factor applied to every line.

**Always**: when several windows can cover the same key (day, slot, seat),
decide the boundary semantics explicitly AND de-dup the keys. Prefer half-open
`[start, end)`: the exclusive end day is the day after the instant the window
closes, so an assignment ending at the start of day D leaves D to the successor,
while an end during or at the end of day D still covers D. Claim each key at
most once in a deterministic order (project-id here) for any residual overlap.
Then assert the invariant directly — "windows covering the whole period sum to
the paid days, never more" — with a dedicated handoff test and an overlap test;
a full-period test with disjoint windows passes on the inclusive code and cannot
catch it.

