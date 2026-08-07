# Test Audit — Issue #280 (debounce Ctrl+K search + lazy Fuse index)

- **Base:** `256f24a`, **Head:** `7c621ec14ece336c8dcc8b01fe613c696f374a00`
- **Tier:** Standard
- **Audited:** `apps/web/src/hooks/use-debounced-value.test.ts` (new, 6 tests),
  `apps/web/src/features/app-shell/home-view.test.tsx` (new "global search"
  describe, 6 tests), `tests/e2e/search.spec.ts` (new, 2 tests), plus the
  fixture mock surface in `workspace-fixtures.tsx`.

## Edge Case Hunter

Covered:
- Debounce hook: initial value returned immediately; NO emit before delay;
  emit exactly at delay boundary; trailing-edge restart on rapid changes
  (only the last value is emitted); unmount clears the pending timer; non-string
  values (null reset flows).
- Shell: empty-query shows page categories; **174ms → no results / 175ms →
  results** (boundary value pair); first-keystroke transient (query non-empty,
  debounced still empty → categories stay, no wrong "no results" flash);
  clear-input restores categories immediately (no stale results while the
  debounced value catches up); close clears the query for reopen.
- Lazy gating: all seven corpus queries `enabled:false` while closed, `true`
  while open, `false` again after close (full lifecycle round-trip).
- E2E: real user flow create warehouse → Ctrl+K → type → result row → Enter →
  detail page; clear-query → categories; Escape closes.

Gaps (advisory, non-blocking):
- 🟡 `useDebouncedValue` with a *changing* `delayMs` is untested. The hook
  supports it (effect dep); the only call site passes a constant 175. Same
  cleanup/restart code path as value changes. Low risk.
- 🟡 E2E cannot assert debounce timing with real timers — the 175ms window is
  pinned by the fake-timer unit tests; E2E asserts end-to-end behavior only
  (type → result appears). Intentional layering.

## Coverage Analyst

- **Acceptance criteria → tests:** debounce (hook unit + shell boundary test +
  E2E flow); lazy index (gating test proves the observable seam: query hooks
  disabled while closed); eager-fetch elimination (same gating test asserts
  `enabled:false` at mount, including the previously-unconditional inventory +
  invoices hooks).
- **Diversity:** fake-timer hook unit tests, rendered-shell integration tests,
  Playwright E2E — three distinct layers, no pattern monotony.
- **Duplicate coverage:** none. Hook tests pin the primitive; shell tests pin
  the wiring (gating flags + results derivation); E2E pins the user path.
- **Missing:** nothing material for the change's surface. The debounced empty
  query branch is covered by two tests (debounce transient + clear-restores).

## Quality Reviewer

- Test names describe behavior ("defers fuzzy results until the 175ms debounce
  window elapses"), not implementation.
- Async handling correct: `act(() => vi.advanceTimersByTime(n))` wraps state
  updates; fake timers restored in `finally` (shell tests) and
  `afterEach` (hook describe) — no timer leakage across tests.
- Isolation: `resetAllMutations` (beforeEach) now also resets the search-state
  tracker; `getSearchQueryState` returns a copy so tests can't mutate the
  tracker's shape.
- Assertion quality: `toEqual` full-object assertions on the gating flags
  (catches both missing and extra enabled queries), `toBeNull` for absence,
  scoped `.fixed.inset-0` locators in E2E so a background list row cannot
  satisfy the result assertion.
- Minor nit: shell tests close the dialog via Escape keyDown rather than the X
  button — the X button has no accessible name (pre-existing a11y gap in
  `search-dialog.tsx`, outside this issue's ownership).

## Verdict

No blockers, no actionable findings. Edge-case and assertion quality are
commensurate with a Standard-tier perf change. The only residuals are
advisory (changing-delayMs test, X-button a11y) and are either constant-param
or pre-existing/out-of-scope.
