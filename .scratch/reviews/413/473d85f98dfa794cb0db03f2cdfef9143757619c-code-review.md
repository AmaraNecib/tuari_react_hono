# #413 stock charge - PR #422 round-4 code review

- mode: remote
- base ref: `develop`; merge-base `199798b`; round-4 parent `35cd96f`
- reviewed HEAD: `473d85f98dfa794cb0db03f2cdfef9143757619c`
- diff: `git diff 35cd96f...HEAD` (round-4 delta; whole-branch evidence is in
  `4750aba-*.md`, `f69630d-*.md`, `bd02d0f-*.md`)
- tier: High-assurance (financial calculation)

Process note: this is a lane review. The independent fresh-context review for
this round is the critic/defender debate in
`473d85f98dfa794cb0db03f2cdfef9143757619c-debate.md`; every critic finding was
classified and the fixed ones landed in `473d85f` before this file was written.

## Standards

Sources: `AGENTS.md`, `docs/engineering-workflow.md`, `.agents/wisdom/*.md`, and
the Fowler smell baseline.

- **One money rule preserved.** The write-time aggregate check compares against
  the same `MAX_MONEY_DZD` the per-charge write gate
  (`nonNegativePaymentAmountSchema`) and the `totalDzd` output contract use. No
  second bound was introduced. The read backstop and the write gate now share a
  single `projectTotalOutOfRange(currentTotalDzd, field)` message builder naming
  the limit and the current total.
- **Locking discipline.** Read-check-write for corrections/voids runs inside
  `repository.withTransaction`; the sqlite adapter's UPDATE carries
  `AND status='LIVE'` and appends the revision only when `result.changes > 0`,
  mirroring the `expenses.module.ts` pattern the parent cited. The in-memory
  double mirrors the same guard, so the module-seam tests cannot diverge from
  production semantics.
- **Aggregate query, not a scan.** The gate uses the new
  `sumLiveChargesByProject` port method (one `SUM` in sqlite, one reduce in the
  double) rather than loading and mapping a project's rows on every asset in a
  bulk invoice.
- **Stale `/* v8 ignore */` removed.** The formerly-unreachable null branch in
  `updateCharge`/`voidCharge` is now a real typed `BUSINESS_RULE` path with a
  stubbed-repository test, so the coverage escape is gone.
- **Typed errors.** New refusals stay `InventoryError("BUSINESS_RULE")` with a
  `fieldErrors` entry; no new error shape reaches the wire. Void now reports an
  action-specific message.
- **UI state is entity-keyed.** `editing`/`voiding` are scoped by charge id, not
  shared primitives - the correct fix for shared per-row action state.
- **Comments match the code.** The DDL comment, the design doc's round-4
  section, and the dialog/aggregate comments each describe the actual behaviour,
  including the accepted `resolveDefault`-before-the-lock and
  correction-vs-void asymmetry.
- **Smells:** none introduced. The port gained one purpose-named method (not
  speculative generality); the dialog's extra `chargeRequired` boolean is a
  derivation, not new state; no duplication beyond the deliberate
  in-memory/sqlite double.

Hard violations: none. Tooling (typecheck, lint, unslop, i18n keys) is green.

## Spec

Spec sources: the eight round-4 parent findings (quoted in the debate file) and
`.scratch/implementation/413-design.md` ("Review round 4").

| Parent requirement | Implemented | Pinning evidence |
| --- | --- | --- |
| F1 enforce the aggregate at WRITE time, typed error naming limit + current total | yes: gate inside `withTransaction` on create + correction; single message builder names `${MAX_MONEY_DZD}` and the current total | service "refuses a placement..." + "refuses a correction..."; legacy read-backstop test |
| F2 read-check-write inside the lock + `AND status='LIVE'`, void path the same | yes: `requireLiveCharge` moved inside `withTransaction`; adapter UPDATE gated on LIVE; void identical | sqlite "refuses to update or append a revision to an already voided charge"; service null-path test |
| F3 handle a failed default explicitly | yes: `chargeDefaultUnavailable`, amber alert, percent disabled, plain amount usable, blank submit blocked; pending renders a loading hint | dialog failure + pending + blocked-blank tests |
| F4 reason tied to the charge acted on | yes: `editing`/`voiding` keyed by charge id; void collects its own reason | history A-reason/B-void test |
| F5 invalidate the affected project's charges after invoice create | yes: union of group `projectId` + every `entry.projectId`, using the exact query key | real-QueryClient refetch test |
| F6 remove the project-list N+1 | yes: name resolved once per project list; the write gate uses an aggregate query | adapter name-once + sum tests |
| F7 real-SQLite transfer+charge rollback on the shared connection/lock | yes: real adapters, one `createFifoLock()`, fail after the real charge insert | new describe's rollback test |
| F8 no historical backfill; document the gap | yes: DDL comment above `inventory_asset_charge` + design doc round-4 item 8; no UI shows the total yet (#414) | code + design doc |

Missing / partial: none within the findings' scope.

Scope creep: the debate fixes (aggregate query, message unification, pending
state, action-specific void message, `afterEach` guard) are all directly in the
touched lines and were raised by the fresh-context critic.

Implemented-but-wrong: none found. The accepted `resolveDefault`-before-lock and
the correction-vs-void recovery asymmetry are documented decisions, not defects.

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm --filter @tuari/contracts test` | 4 files / 175 tests pass |
| `pnpm --filter @tuari/api exec vitest run src/modules/inventory --maxWorkers=2` | 5 files / 58 tests pass |
| `pnpm --filter @tuari/web exec vitest run src/features/inventory --maxWorkers=2` | 5 files / 55 tests pass |
| `pnpm typecheck` | 4 tasks pass |
| `pnpm lint` | 2 tasks, 0 errors |
| `pnpm check:unslop` | PASS (exit 0) |
| scoped v8 coverage on `asset-charge.service.ts` | 100% stmts/branches/funcs/lines |
| `pnpm test:api` | 77/78 files green; `recovery-key.service.test.ts` hook-timeout under heavy machine load (unrelated auth file), passes standalone at `--hookTimeout=120000` (24/24) |
| `pnpm test:web` | 79 files / 668 tests pass |

## Waiver note

The one red API file in the final full run is
`src/modules/auth/recovery-key.service.test.ts`, a file-based-sqlite suite whose
per-test `beforeEach` env build exceeds the default 10s hook timeout when the
shared machine is loaded (CPU ~70%, other crew lanes running). It is untouched
by this branch (`git diff --name-only 35cd96f...HEAD` contains no `auth/`
file), it passed in the previous full run on `6b268b9`, and it passes 24/24
standalone with `--hookTimeout=120000`. This is the documented load-flaky class,
not a regression.
