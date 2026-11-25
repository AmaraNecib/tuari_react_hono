# #336 payment robustness

- Base: `f779b3cdfab6b784edce7db5d200c31b46182288`.
- Worktree: `D:/worktrees/tuari_react_hono/t3-e0dacdda-b64afcb5198e0077`.
- Verification: `focused-local / CI-final-enforced`, as supplied by the parent. No hosted acceptance is claimed.
- Tier: High-assurance. Reachable payment allocation, cursor and transaction behavior can affect money and persisted state.
- Acceptance: focused exact payment cursor fallback parity across memory and disposable SQLite; exact `0.30` allocation equality via RPC and SQLite; exact deletion inside an outer SQLite transaction with rollback and standalone replay; source-backed documentation of the legacy transaction boundary.
- Scope: add narrow tests, documentation and this design record. No production financial logic, schema or policy changes.
- Architecture: no seam moved. The service interface and its memory and SQLite adapters remain unchanged.
- Review: parent owns the three distinct initial lenses after this commit. CI-final remains a separate current-head acceptance gate.
