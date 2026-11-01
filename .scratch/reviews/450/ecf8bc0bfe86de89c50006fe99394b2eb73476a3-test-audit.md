# #450 test audit

- Source reviewed: `b7b8062ad68bd98d7727d337efedaa5b24f3c01b`
- Final tree: `ecf8bc0bfe86de89c50006fe99394b2eb73476a3`
The audit was static. One reviewer covered the edge-case, coverage, and quality lenses, so those lenses were not independent.

## Result

Grade: B.

The audit found coverage for normalized quantity conversion, source identity and picker parity, exact micro-unit mismatches, 13-row fulfillment, final-remainder rejection, and rollback through the shared SQLite transaction. It found no incorrect movement totals or misleading ordering assumptions.

One P3 gap remained: the helper had sign handling, but tests lacked direct negative and zero cases. Commit `e52eabf5dc1aae5eb5ffdba16555e5b6bf38f2d6` adds assertions for `-1.25 -> -1_250_000n` and `0 -> 0n`. The helper test file passed 5 tests after that change.

## Limits

The audit ran no tests. It did not count sub-quantum rows returned by the repository as coverage for the allocator's zero-row skip. The repository filters those rows upstream, so that branch remains outside the current service fixture.
