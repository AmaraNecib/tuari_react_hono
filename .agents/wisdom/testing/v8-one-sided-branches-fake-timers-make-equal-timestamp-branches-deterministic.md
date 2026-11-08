## v8 one-sided branches: fake timers make equal-timestamp branches deterministic (🟡 Minor)

`listDebtsSummary` orders accounts `updatedAt DESC`, so the
`current.latestActivityAt > account.updatedAt ?` branch's false side only fires on
EQUAL timestamps, a timing-dependent case. `vi.useFakeTimers()` +
`vi.setSystemTime(...)` freezes `new Date()`, so two back-to-back account creates
share an `updatedAt` and the branch fires deterministically. Restore in `finally`.
**Always**: for time-comparison branches that depend on millisecond equality, use
fake timers, not sleeps.

