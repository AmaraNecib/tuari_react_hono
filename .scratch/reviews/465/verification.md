# Verification — outbound item picker availability (#465)

Lane `fix/outbound-selector`. Re-pinned after the `origin/develop` rebase: base
`origin/develop` @ `551948e4`, fix commit `dfdaad48`. All commands run from the worktree
root with `VITEST_MAX_WORKERS=2`.

## Red/green (behaviour tests proven to fail pre-fix)

Pre-fix means the production files temporarily reverted with
`git stash push -- <production files>` while the new test files stayed in place; the
contracts dist still carried the new exports so the API suite could run. These runs were
made on the original `fix/invoice-create` base, before the rebase; the code under test is
identical after the rebase.

| Suite | Pre-fix result | Post-fix result |
| --- | --- | --- |
| `@tuari/contracts test inventory-item-usage` | 6 failed / 7 passed (all six new tests) | 13 passed |
| `@tuari/api test item-offer-equivalence` | 3 failed / 13 passed | 16 passed |
| `@tuari/web test outbound-transfer-create-page` | 5 failed / 0 passed (page still imports the unpaged hook the mock does not provide) | 5 passed |

The three API failures pre-fix were: the SQL/JS agreement sweep, the explicit
availability trap (a definition with no stock at the source was still offered), and the
cursor-scope reset for a different source.

## Green runs (after rebase onto `origin/develop` @ `551948e4`, HEAD `dfdaad48`)

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | exit 0 |
| `pnpm typecheck` | exit 0 (4/4 packages) |
| `pnpm lint` | exit 0 (includes `check:i18n-keys`, unslop, eslint) |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/contracts test` | exit 0 — 6 files, 239 passed |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api test inventory shared` | exit 0 — 9 files, 126 passed |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api test item-offer-equivalence` | exit 0 — 16 passed |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/web test outbound-transfer-create-page` | exit 0 — 5 passed |
| `VITEST_MAX_WORKERS=2 pnpm test:web` | exit 0 — 98 files, 913 passed |

## What could not be verified here

- **No Playwright run.** The outbound page test is jsdom-level; an E2E spec would need
  ports 3000/4318 and a coordinated E2E lane. The parent owns that slot.
- **No hosted/managed review and no push** per the lane brief.
- **Local Greptile CLI not run:** the binary is installed but `greptile whoami` returns
  `access_denied`; it needs an interactive `greptile login`.
- The server write path's own stock check is untouched (deferred to #450), so the read
  rule and the write gate are not proven to agree by an execution test yet.

## Round 2 — aggressive local review fixes (HEAD `918290aa`)

Review fixes on top of `dfdaad48`: stale pick cleared on source change, stable
row keys, functional row updates, DB-projected equivalence candidate, cache-key
test, submit test, corrected contract/design prose. Base still `origin/develop`
@ `551948e4`.

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | exit 0 |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/contracts test` | exit 0 — 6 files, 239 passed |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api test inventory shared` | exit 0 — 9 files, 126 passed |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api test item-offer-equivalence` | exit 0 — 16 passed |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/web test outbound-transfer-create-page` | exit 0 — 7 passed |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/web test inventory-hooks` | exit 0 — 9 passed |
| `pnpm --filter @tuari/web test -- --maxWorkers=2` | exit 0 — 98 files, 916 passed |
| `pnpm typecheck` | exit 0 — 4/4 packages |
| `pnpm lint` (includes `check:unslop`, `check:i18n-keys`) | exit 0 |
| `pnpm check:unslop` | exit 0 — PASS |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api test:coverage` | exit 0 — 91 files, 1643 passed, 2 skipped |
| `pnpm test:e2e warehouses.spec.ts` | exit 0 — 3 passed (includes `/outbound-transfers/create`) |

Mutation proofs (production file restored after each) are recorded in
`918290aa-test-audit.md`.

**Flake observed once:** the first `test:coverage` run failed on
`auth/adapters/sqlite-bootstrap.port.test.ts` ("propagates a cross-connection
write-lock contention", 5 s timeout) under machine load. It passed standalone
(`10 passed`) and the full coverage gate passed on re-run. Not related to the
diff.

**Not verified:** local Greptile CLI (`greptile whoami` returns `access_denied`
without an interactive login); the parent owns push/PR and the hosted review.
