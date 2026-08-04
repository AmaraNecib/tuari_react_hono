# Test Audit — #236 (workspace data layer, one query-key seam)

Head: `98c261d` · Base: `bb49ec2` · Tier: Standard

## Process

Three parallel review agents (edge case hunter, coverage analyst, quality
reviewer) audited the tests + source of the #236 diff
(`git diff bb49ec2...98c261d`).

## Findings → disposition

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| EC-1 | Inventory/employee-debt mutations built raw keys with a null `getCachedSessionUserId` → `[..., null]` key miss (no prefix fallback) | 🟠 | **Fixed** — `invalidateUserScopedQuery` (null → prefix-wide) now used by all single-key invalidation sites; integration test added for the pre-session mutation path |
| EC-2 | `getCachedSessionUserId` fix pinned by exactly one path; `orpc.session.key()` regression would be masked by the prefix fallback elsewhere | 🟠 | **Fixed** — moved to workspace-keys (pure) with direct tests: resolves from `queryOptions().queryKey`, does NOT resolve from bare `key()`, null for empty/signed-out cache |
| EC-3 | `invalidateWorkspaceDomains(null, {})` prefix-wide vs documented empty-record no-op | 🟡 | **Fixed** — empty record short-circuits before the null branch |
| EC-4 | `invalidateQueries` rejection semantics unpinned | 🟡 | Accepted — no `throwOnError`; failure propagates into `onSuccess` post-success; documented residual |
| EC-5 | Arity-derived `WorkspaceDomain` vs `Function.length` runtime twin can diverge for hypothetical mixed-arity keys | 🟡 | Accepted — pinned by the flat-membership test; the compile-time rejection of param'd keys is inherent to the derived type |
| EC-6 | Session gate `user: null` / id-less user untested | 🟡 | **Fixed** — `user: null` (resolved signed-out) gate test added; id-less user impossible per `sessionUserSchema` |
| EC-7 | `"anonymous"` default vs `null` in hook path (two no-user key shapes) | 🟡 | Accepted — documented; wrapper always passes explicit `null`; factory default is legacy |
| EC-8 | debts/employee-debt modules have zero direct coverage | 🟠 | Debts: **disproven** (comprehensive `useDebtPartyDetailQuery`/`useDebtsSummaryQuery` tests already exist). Employee-debt: **fixed** — `employee-debt-hooks.test.tsx` integration test (account freshness after entry create) |
| EC-9 | Empty-string userId treated as real user | 🟡 | Accepted — impossible per `sessionUserSchema` (`id` min 1) |
| Q1 | E2E `warehouses.spec.ts` claims to pin invalidation but `page.goto` is a full reload (cache wiped) | 🟠 | **Fixed** — comment rewritten: the assertion pins shared key/endpoint single source of truth; the invalidation seam is pinned by the unit integration tests |
| Q2 | `toHaveBeenCalledTimes(2)` brittleness | 🟡 | Accepted — stable with `retry: false`, no StrictMode |
| Q3 | Inventory-hooks placeholder suite (20 `expect(true)` tests) replaced by 1 integration test | — | Intentional — placeholders verified no behavior; superseded by real key/invalidation tests |

## Verification after fixes

- `pnpm typecheck` ✓ · `pnpm lint` ✓
- Web unit tests: 375 passed (48 files)
- Full Playwright E2E suite: 12 passed, 2 skipped (employees spec pre-skipped #227)
- `test:api` unaffected (no API changes)

## Residual risks

- `employeeDebtAccountGet`'s null-account path can't be exercised client-side
  (the `createEntityResultSchema` output rejects `item: null`) — pre-existing
  contract quirk, out of scope; the hook's `DebtAccount | null` typing is
  aspirational for that path.

## Post-evidence delta (docs-only)

Evidence re-based from `98c261d` to `4ebe36e` after a docs-only commit
(.agents/wisdom capture — no source change). All findings/dispositions above
remain valid for the final head.
