# Confirmed recovery state

Base `df08a808f59ab4cf7c1f39e560c25a8e56518d5d`, PR #541, earnings scope #543. Verification mode is focused-local / CI-final-pending. This is a bounded high-assurance correction to review finding P2 in the salary combined-delta review.

The initial memoized recovery record is useful for restoring an unresolved request, but it is historical after a schema-valid approval clears durable storage. Remember which exact initial record was confirmed and exclude it from active recovery. Employee B's newly mounted idle form must not reactivate employee A's already-confirmed request. A different recovery record, scope, pending approval, unreadable store or uncertain result still blocks unsafe changes. No request ID or money semantics change, and no original database or browser storage is directly modified by this code change.

The existing restored-approval test now adds a second employee, confirms A's original request, switches to B and checks that B loads, employee selection and navigation remain unlocked, old recovery copy is absent, and only one approval call occurred. Before the correction it failed at the unlocked selector assertion, expected false, received true. After the correction, both affected files pass, 18 tests total. Web typecheck and affected ESLint pass. The test still mocks useBlocker; full browser interaction remains separate proof.

This does not complete root full-production page integration, native acceptance, hosted review or CI. It changes only the page's recovery-state interface and its direct test. Existing unrelated dirty work remains excluded.
