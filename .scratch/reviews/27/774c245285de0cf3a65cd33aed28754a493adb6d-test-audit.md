# Test audit — issue #27 (empty-state guidance)

- base SHA: `fbb7d029b78c56558764812c518bfec51bc1be7b`
- reviewed head: `774c245285de0cf3a65cd33aed28754a493adb6d`
- agents: `reviewer` Edge Case Hunter (`c241a5a3`), Coverage Analyst
  (`a9c0c719`), Test Quality Reviewer (`a6125655`) — round 1, parallel
- test files audited: `apps/web/src/features/shared/record-page-frame-empty-state.test.tsx`,
  `apps/web/src/features/app-shell/empty-state-cta.test.tsx`
- tier: Standard — evidence SHA matches the final reviewed HEAD

## Coverage analyst (round 1)

All five design criteria covered: hint renders (unit + integration, all four
hint strings), CTA renders with label, CTA targets the right route
(`to`/`params`/`href` asserted in unit tests), populated state unchanged,
items-catalog hint. Two layers with no duplicated assertions; route `search`
props not asserted but the two routes carry none.

## Edge case hunter (round 1)

- 🟠 hint-only / CTA-only branch independence untested → FIXED (f4196b6):
  two unit cases render each branch alone.
- 🟠 integration never validates the real CTA target for
  `employeeEdit(employee.id)` → accepted: target resolution asserted at unit
  level; the integration fixture's Link mock drops route props from the DOM.
- 🟠 missing/encoded param untested → accepted (`resolveHref` is test-only).
- 🟡 RTL layout / populated-flash not asserted → accepted (RTL-only app;
  post-load states only, matching detail-page conventions).
- 🟡 non-worker work-history CTA semantically wrong → FIXED (f4196b6): gated
  on `isWorker` with a non-worker regression.

## Test quality reviewer (round 1)

Grade B: conventions match the suite; strong assertions; constants
centralize copy. FIXED: `testTimeout` raised to 60000 (load-proof), the
inconsistent `act()` wrapper dropped. A suspected project-workers timeout was
verified as a load flake (debug render confirmed the hint renders with
`projectAssignments: []`).

## Round 2 — hosted Greptile regression gap (PR #40, 4/5) → fixed (774c245)

Hosted Greptile found a real must-fix: a worker-role but non-ACTIVE employee
still received the edit-workplace hint + CTA (gated on `isWorker` only), a
dead-end because #20 persists placement for ACTIVE workers only.

Regression tests added (`empty-state-cta.test.tsx`): `it.each(["INACTIVE",
"LEFT"] as const)` worker-role employees with empty history render the
label-only empty state — no hint, no CTA. The pre-existing ACTIVE-worker case
("renders a hint and an edit-workplace CTA when the history is empty")
continues to assert the positive path. Bounds: the gate is
`status === "ACTIVE"`, so any non-ACTIVE value is covered by the two statuses
tested plus the non-worker case.

## Result

Blockers: none after round-2 fixes. Feature suites: 7 unit + 10 integration
tests. Full web suite 578/578 green; typecheck + lint clean. API untouched
(1254/1254 run green earlier; the intermittent pre-existing SQLite lock-test
flake is unrelated and base-identical).