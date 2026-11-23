## Coverage chase exposes latent divergence bugs; unify before covering (🟠 Major)

Pushing `company/**` to 100% branches forced both halves of `buildCompanySystemLog`'s
filtering into view: the group gate compared dates with raw string operators
(`event.createdAt < filters.fromDate`) while the within-group matching set used
`compareTimestampsDesc` (real `Date` math). For non-ISO filter strings
(e.g. date-only `"2026-01-01"`) the two could DISAGREE, so a group could pass the
gate while every event failed the timestamp filter, and the old
`sortedEvents.find(...)` fallback chain then promoted an event that did NOT match
the filters to `primaryEvent` (leaking wrong rows past date filters). Fix: one
shared `matchesFilters` predicate drives both, making `matchingEvents` provably
non-empty and the fallback chain provably dead. **Always**: when a branch looks
unreachable in a filter/sort path, check whether two parallel implementations
have divergent semantics before writing test hacks.

