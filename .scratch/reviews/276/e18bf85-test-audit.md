# Test Audit — Issue #276 (workspace snapshot consolidation)

- Head SHA: `e18bf85`
- Base SHA: `256f24a`
- Changed test files: `workspace-keys.test.ts`, `workspace-queries.test.ts`,
  `tests/e2e/workspace-snapshot.spec.ts` (new)

## Agent 1 — Edge Case Hunter

| Edge case | Status | Where pinned |
|---|---|---|
| Empty session / pre-session mutation touching a snapshot-backed domain (unknown userId) must clear the snapshot prefix too | ✅ covered | `invalidateWorkspaceDomains` "covers the snapshot prefix when a snapshot-backed domain changes with an unknown userId" |
| Debts-only invalidation must NOT refetch the snapshot (avoid perf regression) | ✅ covered | "does not refresh the snapshot for feature-scoped (debts-only) invalidations" + "keeps the snapshot untouched for feature-scoped invalidations with an unknown userId" |
| Empty domain record must be a no-op (known and unknown userId) | ✅ covered | pre-existing tests, still passing |
| Multi-domain invalidation includes exactly one snapshot invalidation (no double-fetch) | ✅ covered | "invalidates exactly the requested domains…" asserts exactly 3 calls for 2 domains + snapshot |
| Composite disabled until session resolves (key falls back to anonymous scope) | ✅ covered | "stays disabled until the session resolves" (queryKey `["phase1","workspace",null]`, enabled false) |
| Single RPC, no fan-out: composite queryFn calls `workspaceSnapshot()` once and never `rbacRolesList` | ✅ covered | "mounts one query that resolves the whole workspace from the snapshot RPC" |
| CORS preflight (OPTIONS) must not inflate the E2E request count | ✅ covered | spec filters `request.method() !== "POST"` |
| StrictMode double-mount double-fetch | ✅ verified empirically | React Query v5 dedupes in-flight queries per key; E2E passed twice with count === 1 |
| Real `debtAccounts`/`debtEntries` in the snapshot (previously `[]`) | 🟡 residual | no consumer reads these fields off the workspace object (grep-verified); type-compatible; documented in design doc |
| Error state of the snapshot query | 🟡 residual | home-view error/retry path covered by existing fixture-based `home-view.test.tsx` (mockState.workspaceError); the real RPC error path is exercised by the same `useWorkspaceScopedQuery` gate the suite already tests |

## Agent 2 — Coverage Analyst

- **Acceptance criterion (composite → single workspaceSnapshot RPC)**: unit test
  pins key + single call + no fan-out; E2E pins the network-level behavior
  (exactly one `/rpc/workspaceSnapshot` POST, zero individual list RPCs).
- **Snapshot-backed membership**: the 12 composite domains are enumerated in
  `SNAPSHOT_BACKED_DOMAINS`; representative invalidation tests cover one
  snapshot-backed domain (salaryPayments) and the multi-domain path
  (warehouses+projects); `debtAccounts`/`debtEntries` correctly excluded
  (feature-scoped). The remaining memberships are data-list entries reviewed
  against `workspaceSnapshotSchema` — all 12 present, no extras.
- **No duplicate coverage**: the composite "stays disabled" test re-verifies the
  wrapper wiring only; the gate itself is covered once in
  `useWorkspaceScopedQuery` tests.
- **Missing**: none material. A per-domain parameterized test for all 12
  memberships would be tautological (asserts the source list against itself).

## Agent 3 — Quality Reviewer

Grade: **A**.

- Test names read as specifications ("refreshes the workspace snapshot when a
  snapshot-backed domain changes", "mounts one query that resolves the whole
  workspace from the snapshot RPC").
- Assertions are meaningful: exact query keys from independent literals, call
  counts, `resolves.toEqual` on the queryFn result.
- Async handled correctly (`await expect(...).resolves`).
- E2E: reuses the shared `bootstrapOrSignIn` helper, no explicit waits (the
  dashboard heading only renders after the snapshot resolves, so counts are
  stable by assertion time), request listener scoped per test.
- Minor nit (accepted): composite tests read `mocks.useQuery.mock.calls[0]` —
  safe because only the composite hook calls `useQuery` in those tests.

## Verdict

No actionable findings. Evidence of edge-case, acceptance, and quality coverage
is present and current for HEAD `e18bf85`.
