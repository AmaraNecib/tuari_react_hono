# Salary client seam correction

## Scope

PR #541, current earnings scope #543. Base `0cc1638b0efc96096147d06d25948657d7a6c334`. Mode is focused-local / CI-final-pending. High-assurance applies because recovery and exact earnings are reachable. Native acceptance is deferred to the owner by the current instruction. No schema, financial policy or published contract changes.

## Observed failure

The parent signed in through the T3 integrated browser against the normal API and frontend, using an ignored snapshot of the configured desktop database. The desktop database and durable request were not mutated. At the base, selecting a worker could render earnings, but subsequent project selection reverted to the placeholder without a cost request. Earlier observations also showed worker selection not committing and navigation waiting until reload. The runtime produced unintended `workforceExact/name/valueOf` and `workforceExact/name/toString` requests. A raw oRPC namespace is a callable Proxy: reading its method metadata can traverse more RPC paths instead of returning ordinary function metadata.

## Interface and implementation

`WorkspaceShell` now supplies an ordinary, memoized `ExactWorkforceEarningsClient` adapter to the salary module. Its three named methods call the actual injected application's oRPC methods. The adapter hides the callable namespace and its reflective metadata behavior from React consumers. Parameters, results, rejected promises, authenticated transport, exact money and recovery semantics are unchanged. There is no numeric fallback or alternate financial implementation.

The deletion test is concrete: removing this adapter puts the callable transport Proxy back into the presentation interface and returns reflective behavior to callers. Real transport and ordinary object test clients are the existing adapters; this correction does not introduce a new domain model. An earning remains an approved exact obligation, not a cash payment.

## Proof

The regression exercises `WorkspaceShell` with a real oRPC client, checks that the presentation receives an inspectable object with ordinary function names, and verifies the exact business method paths through the real link. Temporarily passing the raw namespace makes the test fail with expected object, received function. With the adapter, the test passes. It does not pretend to reproduce every browser or React scheduling internal.

In the integrated browser, the corrected tree displayed the existing 62,500 earning and ordered A/B/A allocations, then read project A as 25,000 and B as 37,500. Keyboard navigation to employees changed the route without a refresh. An automated pointer click on the hover-expanding sidebar timed out; that is recorded separately rather than called a pass. Temporary startup exception instrumentation was removed before commit. The exact internal mechanism behind the earlier stalled React update is not established solely by this correction.

Affected proof: five focused files, 28 passing tests; web typecheck and affected ESLint exit 0. Full suites, native checks, hosted acceptance and full-application integration were not performed by this correction. The previous salary UI implementation has its own green proof, but no pre-implementation red run. All unrelated dirty payroll, Cargo, generated-schema and contract work remains excluded.
