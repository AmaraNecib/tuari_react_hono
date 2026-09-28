# #413 stock charge - PR #422 round-4 test audit

- mode: remote
- base ref: `develop`; merge-base `199798b`; round-4 parent `35cd96f`
- reviewed HEAD: `473d85f98dfa794cb0db03f2cdfef9143757619c`
- tier: High-assurance (financial calculation)

Process note: run as a lane audit (edge-case hunter + coverage analyst +
quality reviewer lenses together). The independent fresh-context cross-check is
the critic/defender debate in
`473d85f98dfa794cb0db03f2cdfef9143757619c-debate.md`.

## What round 4 added or changed

`apps/api/src/modules/inventory/asset-charge.service.test.ts`:

- "refuses a placement that would push the live project total above the bound" -
  creates `MAX_MONEY_DZD`, then a second charge of 1 throws a typed
  `BUSINESS_RULE` error whose message names the limit; asserts
  `repository._charges.size === 1` (nothing written) and the total stays
  readable.
- "refuses a correction that would push the live project total above the bound" -
  seeds `MAX - 1` + `1`, corrects the `1` to `2`, asserts `/الحد الأقصى/` and the
  total unchanged.
- "refuses to emit a legacy project total above the shared money bound" - seeds
  two over-bound charges through the repository (bypassing the write gate) and
  pins the read backstop's `BUSINESS_RULE` + `totalDzd` field.
- "treats a write that matched no live row as refused instead of resurrecting
  the charge" - a repository stub returning `null` from `updateCharge` drives
  the new service `!result` branches for update and void.

`apps/api/src/modules/inventory/adapters/sqlite-asset-charge.repository.test.ts`:

- "refuses to update or append a revision to an already voided charge" - the
  `AND status='LIVE'` UPDATE returns null, leaves the row VOID and the amount
  unchanged, and appends no revision.
- "resolves the project name once and attaches it to every row of the project" -
  pins `projectName` on both rows and no leakage into another project.
- "sums a project's LIVE charges in one query and can exclude one charge" -
  pins the aggregate, the exclude argument, a missing project (`0`), and that a
  void drops out of the sum.

`apps/api/src/modules/inventory/inventory-transfer-charge.test.ts`:

- New `describe` over the REAL sqlite adapters on one shared `createFifoLock()`:
  seeds warehouse/project/asset, monkey-patches `createCharge` to insert the
  real row and then throw, and asserts the charge (by unit and by project), the
  movement and the asset location all rolled back. This replaces reliance on the
  in-memory harness's own snapshot/restore.

Web:

- `asset-charge-history.test.tsx`: the void flow now confirms; a new test types a
  correction reason on charge A and then voids charge B, asserting B records its
  own reason and never A's.
- `transfer-item-dialog.test.tsx`: a failed default says the price is
  unavailable, keeps a plain amount usable, disables percent and does not render
  `سعر الشراء: 0`; a pending default renders the loading hint; a blank amount
  while the price is unavailable disables submit.
- `inventory-hooks.test.tsx`: with a real `QueryClient`, creating an invoice for
  a project refetches that project's charges query (0 -> 100_000, exactly two
  RPC calls).

## Coverage against the round-4 requirements

| Requirement | Test | Verdict |
| --- | --- | --- |
| Aggregate enforced at write time, typed error names limit + current total | service placement + correction tests | covered |
| Project can never be left with an unreadable total | write refusal asserts nothing written + total still reads; read backstop test for legacy state | covered |
| Correction read-check-write under the lock + `AND status='LIVE'` | sqlite adapter voided-update test + service null path | covered |
| Failed default handled explicitly | dialog error test + no fake zero + plain amount + blocked blank | covered |
| Reason tied to the charge | history A-reason/B-void test | covered |
| Invoice create invalidates project charges | real-QueryClient refetch test | covered |
| N+1 removed for a project list | adapter name-once test | covered (by construction; not query-counted) |
| Real transfer + charge roll back together | real-sqlite rollback test | covered |
| No historical backfill documented | DDL comment + design doc | documentation, not a test |

## Edge cases

- Exact bound: a total landing on `MAX_MONEY_DZD` is still returned; a write that
  would exceed it is refused. Both pinned.
- Correction arithmetic: the replaced amount is subtracted, not added.
- Legacy over-bound state read path: still refuses rather than emitting an
  out-of-contract number, with the same message builder as the write gate.
- Voided rows never re-enter the sum.
- Missing project name still reads back `null`.
- Blank vs explicit zero vs invalid amount: unchanged from round 3 and still
  pinned.

## Gaps accepted

- No genuinely separate-process/connection test for the TOCTOU window. One
  synchronous better-sqlite3 connection cannot interleave; the conditional
  UPDATE is proven by a sequential stale-write test. Stated in the debate file.
- `sumLiveChargesByProject`'s "one query" is by construction, not asserted with
  a query counter.
- The dialog error test fabricates `{ isError: true, data: undefined }` in the
  hook mock rather than driving a real query error; the predicate is unit-pinned
  but the React Query wiring is not driven end to end.
- The `!result` service branches are covered with a stubbed repository, not a
  real cross-process race (impossible on one connection).
- `inventory-transfer-charge.test.ts` seeds rows with raw SQL, so it exercises
  the DDL and FK constraints but not the repository insert paths for the seed
  data.

## Quality

- Names describe the behaviour and the round; assertions pin exact values and
  absence (`not.toHaveBeenCalledWith`) rather than partial shapes where it
  matters.
- The rollback test asserts four independent effects (charge by unit, charge by
  project, movement, location) so a partial rollback cannot pass.
- The invalidation test uses a real `QueryClient` and a real refetch, so it
  cannot pass on a key mismatch.
- No duplicate coverage; each round-4 fix has at least one falsification test.

Grade: A-. Deductions are the accepted gaps above.

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts test` | 4 files / 175 tests pass |
| `pnpm --filter @tuari/api exec vitest run src/modules/inventory --maxWorkers=2` | 5 files / 58 tests pass |
| `pnpm --filter @tuari/web exec vitest run src/features/inventory --maxWorkers=2` | 5 files / 55 tests pass |
| scoped v8 coverage on `asset-charge.service.ts` | 100% stmts/branches/funcs/lines (84/53/23/84) |
| `pnpm test:api` | 77/78 files green; `recovery-key.service.test.ts` hook-timeout under load, passes standalone at `--hookTimeout=120000` (24/24) |
| `pnpm test:web` | 79 files / 668 tests pass |
