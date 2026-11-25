# #336 payment robustness

- Base: `f779b3cdfab6b784edce7db5d200c31b46182288`.
- Worktree: `D:/worktrees/tuari_react_hono/t3-e0dacdda-b64afcb5198e0077`.
- Verification: `focused-local / CI-final-enforced`, as supplied by the parent. No hosted acceptance is claimed.
- Tier: High-assurance. Reachable payment allocation, cursor and transaction behavior can affect money and persisted state.
- Acceptance: cursor fallback parity checks on in-memory, plain SQLite and keyed SQLite exact-service adapters; exact `0.30` allocation equality and nested delete rollback/replay through the public exact RPC fixture on disposable SQLite; source-backed documentation of the legacy transaction boundary.
- Changed paths: `apps/api/src/modules/invoice/invoice-exact.service.test.ts`, `apps/api/src/rpc/invoice-exact-router.test.ts`, `docs/money/payment-robustness.md`, and this design note.
- Local verification at final HEAD: focused cursor test, exact RPC fixture, ESLint on both test files, and API TypeScript check. Raw logs are in ignored `.scratch/reviews/336/run-20260627-a/`.
- Scope: add narrow tests, documentation and this design record. No production financial logic, schema or policy changes.
- Architecture: no seam moved. The service interface and its memory and SQLite adapters remain unchanged.
- Review: parent owns the three distinct initial lenses after this commit. CI-final remains a separate current-head acceptance gate.
