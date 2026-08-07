# 239 — Recurring-patterns: contract truth or delete

**Part of #235** (map: ship the 2026-08-03 web-layer deepenings).
**Review tier:** Standard (contract surface, API router boundary, dead-code deletion — no authz/security/financial logic).

## Decision: drop the procedures from the contract until the recurring feature exists

The recurring-patterns procedures are advertised in `AppClient` but have no server
handlers; an `as any` cast at the router boundary hides the gap. The issue asks to
decide: **implement the handlers** or **drop the procedures until they exist**.

We drop them. Rationale:

1. **No backend exists.** `apps/api/src` has no recurring module — no DB table, no
   repository, no service. A `list` handler would have nothing to read; the only
   "implementation" possible today is a hard-coded empty list, which is fake
   behavior that renders an empty page and *claims* the feature works.
2. **The contract is read-only.** Only `recurringPatternsList` / `recurringPatternsGet`
   are declared — no create/update/delete/activate. A real recurring-transactions
   feature (frequency, occurrence generation, party linkage) is a full feature that
   needs its own design, DB schema, and migration — out of scope for an `as any`
   removal ticket in a behavior-preservation refactor map.
3. **The only consumer is orphaned.** `RecurringPatternsPage` is imported nowhere
   (no route, no nav entry); `use-recurring-patterns.ts` is imported only by that
   page. Deleting both is behavior-preserving — nothing renders them today.
4. **The ticket's purpose is the type gap.** With the procedures gone,
   `os.router(allHandlers)` typechecks against the full contract natively, so
   contract/server drift becomes a build error instead of a hidden `as any`.

### What stays

- `packages/contracts/src/recurring.ts` — the domain data model
  (`RecurringPattern`, `RecurringPatternList`, `CreateRecurringPatternInput`,
  frequency/amountType enums) stays exported from `@tuari/contracts`
  (`export * from "./recurring"`). These are domain vocabulary for the future
  feature, not RPC procedures; they do not create the drift gap. The map (#235)
  treats `packages/contracts` as the domain-terms source.
- `recurringPatterns.*` i18n keys in `ar.ts` are **removed** — they exist solely
  for the deleted page (verified: no other reference).

## Public API / interface changes

| Surface | Change |
|---|---|
| `packages/contracts/src/recurring-contract.ts` | **Deleted** — the two procedures no longer exist |
| `packages/contracts/src/app-contract.ts` | Remove `...recurringPatternsContract` spread + import |
| `apps/api/src/rpc/router.ts` | Remove the `as any` cast + explanatory comment; `os.router(allHandlers)` now typechecks against the full contract |
| `apps/web/src/hooks/use-recurring-patterns.ts` | **Deleted** — calls removed procedures; only consumer is the orphaned page |
| `apps/web/src/features/debts/recurring-patterns-page.tsx` | **Deleted** — orphaned (imported nowhere) |
| `apps/web/src/i18n/resources/ar.ts` | Remove the `recurringPatterns` key block |

`AppClient` no longer exposes `recurringPatternsList` / `recurringPatternsGet`.

## Dependencies

- `@tuari/contracts` build → `@tuari/api` (router) and `@tuari/web` (client types)
  re-resolve. The `recurring.ts` schema export path is untouched.
- No DB, no migrations, no Rust.

## Planned tests

- **Contracts (`packages/contracts/src/index.test.ts`)** — add a regression test
  pinning that `appContract` does **not** advertise `recurringPatternsList` /
  `recurringPatternsGet` (guards against re-adding the spread without handlers —
  the exact drift this issue exists to prevent), while the domain schemas
  (`recurringPatternSchema`) remain exported.
- Existing suites must pass unchanged: `pnpm --filter @tuari/contracts build`,
  `pnpm typecheck`, `pnpm lint`, `pnpm test:api`, `pnpm test:web`.
- No E2E: the feature has no user-facing flow (page was never routed); nothing to
  drive end-to-end.

## Implementation risks

- **Low.** Pure deletion + one spread/import removal + one cast removal.
- **Type gap reappears silently** if someone re-adds the spread → mitigated by the
  contracts regression test.
- Web build would fail if anything else referenced the deleted hook/page → verified
  by grep (no references) and `pnpm typecheck`.
- i18n: only `ar.ts` exists; the block is exclusively used by the deleted page
  (page uses inline fallbacks, so removal cannot change rendered copy elsewhere).

## Deferred / follow-up

- The recurring-transactions feature itself (schema → migration → module → handlers
  → contract procedures → UI route) is unimplemented; re-add the contract
  procedures when the server handlers land. Not tracked as a separate issue here —
  it is the pre-existing "Priority 5 Recurring Transactions" feature scope.
