## Aging buckets must share the same threshold as the classification they feed (Major)
Greptile (P1, issue #242) caught a real internal inconsistency: the debt report bucketed
open accounts by age (`age <= 30 -> 0-30`, `age <= 60 -> 31-60`, else `60+`) while a separate
binary classification `overdue = age >= 60` used a different inclusive threshold. A 60-day-old
account fell in `31-60_DAYS` but was also counted overdue, so the aging breakdown summed to less
than the overdue figure the dashboard showed. Fix: make the bucket partition use the same
threshold as the classification (`age <= 30 -> 0-30`, `age <= 59 -> 31-60`, else `60+_DAYS`) so the
`60+_DAYS` bucket equals `overdueDzd` by construction.

**Always**: when a derived metric (e.g. overdue >= N days) is defined as a threshold, the aging
bucket partition it references must use the identical exclusive lower bound so the bucket sum
equals the metric. Never let a <= N bucket boundary and a >= N classification coexist for the
same N. Pin the exact boundary (age === N) with a dedicated test: mid-bucket seeds won't catch
a one-day off-by-one.

