# #175 debt aggregate measurement

- Tree: `D:/worktrees/tuari_react_hono/t3-51878482-502a4628cb7b8399`
- Base: `baaca20ef708cdf5dfa31538e609f153254a3fba`
- Verification: focused-local / CI-final-enforced; Standard tier for opt-in, non-production measurement accuracy.
- Scope: standalone fixture harness and measurement documentation only. No production behavior or service seam changes.

## Method

`apps/api/src/modules/company/measure-debt-summary.ts` creates a temporary plain SQLite fixture, seeds 1,000 external parties, accounts and live entries, checks independent SQL counts and expected totals, then measures the first invocation, five warmups and 30 calls. Validation is outside timed regions. Details and limits are in `docs/PERFORMANCE.md`.

## Risks and remaining acceptance

- Fixture timing may not predict real dashboard or desktop latency; cache and storage differ.
- Synthetic all-debt data does not represent realistic all-entity memory or production data.
- The initial output was not persisted; do not treat its numbers as raw-log-backed evidence.
- #175 remains open. No complete issue acceptance, encrypted-build assessment, security review, or cold-start claim is made.
- #628 proof is reused, not rerun. CI-final acceptance remains separate.
