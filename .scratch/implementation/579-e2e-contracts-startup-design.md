# E2E contracts startup and connected-exact execution

## Scope and base

- Worktree: `D:/worktrees/tuari_react_hono/t3-ba101e61-45d41e5818731e6b`.
- Original base: `6587e466cdc5913c28777362740a0270ffb8fe6d`.
- Effective base: selector dependency `0ab8b44f134c66163963ea4d5a8b3f5670107e6a`, cherry-picked as `ea9d2b29`.
- Mode: focused-local / CI-final-pending; high-assurance bounded CI correction.

## Cause and changes

The hosted E2E job runs in its own runner and did not build `@tuari/contracts`; other jobs' build output is not shared. The managed API imports source that resolves the package through `dist`, so startup fails when that artifact is absent. The E2E job now builds contracts before Playwright starts. This avoids `tsup --clean` racing a live managed API.

The selector dependency registers `payroll-connected-exact.spec.ts`, but its test is gated and is skipped by the generic Playwright config. The E2E workflow now removes that spec from the generic invocation and invokes it with `playwright.connected-exact.config.ts` when selected. The dedicated configuration provisions isolated ports, server processes, auth/bootstrap/license environment and run artifacts. Existing selector fail-closed behavior and CI acceptance gates are unchanged.

## Writable scope

- `.github/workflows/ci.yml`: contracts build prerequisite and dedicated connected-exact invocation.
- `tests/e2e-selection.test.mjs`: regression assertion for build ordering, spec partitioning and dedicated config.
- This design note.

No production financial, schema, or API behavior changes. No dependency changes, generated output commits, selector semantic changes, policy weakening, publication, or merge.

## Full-scope correction

Execution review exposed a concrete orchestration defect. `selectCiScope` represents full scope with an empty specs string. Partitioning that string alone executed neither browser command. Pass the existing selector mode into the shell and expand `tests/e2e/*.spec.ts` for full scope before partitioning. A shell-execution regression stubs only pnpm, executes the actual workflow block, and checks every generic spec plus exactly one dedicated invocation. It also checks mixed affected and dedicated-only selection. The regression first failed with `full scope must execute generic tests`.

The agreed seam is the existing CI shell command and its selector environment. No financial vocabulary or runtime interfaces change. Architecture: no seam moved. Keep the orchestration local to its one caller rather than introduce a second runner module.

## Proof boundary

Local execution records live under ignored `.scratch/reviews/579-proof`. The owned contracts output was absent before its serialized build. Managed API startup reached health 200 and closed through owned IPC. The dedicated connected-exact case executed without a skip. Full browser execution remains CI-final; the shell regression proves full-scope routing without running the matrix. Hosted acceptance, protection and the parent's combined-delta review remain separate requirements.