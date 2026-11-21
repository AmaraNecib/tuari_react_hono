# E2E selector registrations

- Worktree: `D:/worktrees/tuari_react_hono/t3-16d9a891-db5f5557c7983115`
- Base: `6587e466cdc5913c28777362740a0270ffb8fe6d`
- Mode: focused-local / CI-final-pending; high-assurance bounded CI correction.
- Reachable failure: hosted Lint rejected three existing Playwright specs absent from the strict selector map. No production code or CI policy changes are needed.

## Routing decision

- `payroll-connected-exact.spec.ts` and `payroll-recovery.spec.ts` belong to the employees/workforce feature rule. They exercise employee payroll UI, workforce procedures and payroll recovery behavior. The existing rule already routes employee UI and API changes; these specs extend that ownership. Routing assertions check both source areas and ensure an expenses-only spec does not leak into payroll feature selection.
- `managed-api-isolation.spec.ts` joins `always_specs`. It verifies process lifecycle and exact database isolation, plus the managed-API test fixture's fail-closed behavior. It is harness-wide regression coverage, not owned by payroll or one business feature.
- Existing precedence, unknown/critical fail-closed behavior, docs skips and area semantics remain unchanged. No broad routing mechanism or new skip was introduced.

## Interface and seam

The selector's public seam is `selectSpecs(changedPaths)`, with JSON map entries as its routing configuration. This correction changes registrations and tests only; no selector implementation or seam moved (`architecture: no seam moved`).

## Proof and boundary

- Baseline at the base: `node --test tests/e2e-selection.test.mjs` failed 1/20: anti-rot named exactly the three missing specs; 19 passed.
- After registration: `node --test tests/e2e-selection.test.mjs` passed 22/22 in 311.881 ms, including focused payroll routing, unrelated-feature non-leakage, cross-cutting managed API inclusion, and anti-rot coverage. The two CLI event-file cases ran as part of this test command.
- Mutation check: removing each of the three registrations independently made the selector test command fail (exit 1) each time; all registrations were restored before commit. One malformed first attempt at a temporary mutation script failed before changing the map; it did not run the test suite.
- The two payroll specs are routed by workforce and employee source paths. The managed API spec is included in any affected run through `always_specs` and absent from docs-only skip runs (existing assertion).
- Browser tests, full lint, build, full suite and dependency installation were not run; they are outside this bounded registration correction. Hosted CI acceptance remains parent-owned and pending.
- Task-scoped wisdom search found no matching selector/anti-rot lesson. No lesson candidate.
