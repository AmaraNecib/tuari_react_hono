# Code-review evidence — #288 (head 923b558 + comment fix)

**Tier:** High-assurance · **Base:** 03ec349 · **Head:** 923b558 (one comment fix on top)

## Standards axis

- **Stale evidence (moderate, process)**: evidence filenames carried SHA 4f48282
  while HEAD moved to 923b558 — renamed to the final HEAD before push
  (guard Phase 2 staleness check). ✓ resolved.
- **Advisory smells (kept, documented)**:
  - Middle Man: recovery-key `serialized()` is a pure delegating wrapper over
    `connectionLock.run` — kept as the documented "all public methods route
    through the lock" convention (keeps the locked/unlocked-view split obvious).
  - Duplicated nested-join BEGIN/COMMIT/ROLLBACK skeleton ×3 (bootstrap /
    invoice / payment) — the three differ (raw vs drizzle handle, bootstrap's
    unique-error mapping to conflict); extraction deferred (optional).
  - Speculative Generality (borderline): `busy_timeout = 5000` for a possible
    future second process — one line, matches SQLite's own recommendation.
- **Clean**: names reveal intent; the diff REMOVES the strongest pre-existing
  smell (four divergent hand-rolled locks → one primitive); reentrancy guard +
  FIFO/no-poisoning invariants tested.

## Spec axis

- All four "Done when" criteria implemented and matched to the design doc:
  (1) one connection-wide lock in the composition root injected into all five
  transaction openers; (2) payment BEGIN IMMEDIATE + exact-cap concurrency
  test; (3) adapter tx paths covered (rollback, join, busy/reservation); (4)
  shared primitive extracted.
- Scope additions (documented in design doc, not undocumented creep):
  invoice `runInTransaction` migrated too (same deferred-BEGIN hazard, gap 2's
  "others use BEGIN IMMEDIATE"), factory `busy_timeout`, ALS reentrancy guard.
- No "implemented but wrong" blockers. Post-review fix: stale comment in
  invoice constructor (single-raw-arg fallback can no longer compile — lock is
  a required param).
- Residuals (tracked in #322): unlocked sync writers absorb risk, hung-op
  watchdog, ALS guard best-effort nature.
