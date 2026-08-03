# #215 — Fold the transaction wrapper chain

**Tier:** Standard
**Base:** `f93c37c0dd91646bfdc106c0e0bcc05b149b9e0c` (origin/develop)

## Goal

Delete `TransactionManager` (and its dead `executeMultiple` + `transactional`
decorator); `WorkspaceMutationContext.withTransaction` delegates directly to
`repository.withTransaction`.

## Verified context

- Chain: `WorkspaceMutationContext.withTransaction` → `TransactionManager.execute`
  → `repository.withTransaction` (`workspace-mutation-context.ts:55`,
  `transaction-manager.ts:15`, `company.repository.contracts.ts:26`).
- `TransactionManager` is imported ONLY by `workspace-mutation-context.ts`.
- `executeMultiple`: zero callers outside its own definition + test.
- `transactional` decorator: zero users.
- `withTransaction` is hot: 31 production call sites across workforce /
  operations / finance / account / auth / inventory via `WMC.withTransaction`.
  The fold must preserve this surface exactly.

## Design decision (codebase-design lens)

- **Deletion test:** deleting `TransactionManager` removes complexity entirely —
  it was a pass-through (`execute` = `repository.withTransaction`). No logic
  reappears across callers; the fold is correct.
- **Seam:** `WMC.withTransaction` is the external seam. `repository.withTransaction`
  stays the adapter seam; `WMC` gains no new interface surface (private field +
  `execute` delegation both vanish).
- **Test strategy — replace, don't layer:** the 2 `execute` unit tests move to a
  new `workspace-mutation-context.test.ts` at the WMC interface (same mock
  repository, same BEGIN/COMMIT/ROLLBACK call recording). The 2 `executeMultiple`
  tests are deleted (dead surface).

## Public API / interfaces

- `WorkspaceMutationContext.withTransaction<T>(operation: () => T): T` —
  unchanged signature, implementation now `this.repository.withTransaction(operation)`.
- `WorkspaceMutationContext` constructor — unchanged `(repository, workspaceAdminAuthorizer?)`.
- Deleted: `TransactionManager` class, `execute`, `executeMultiple`, `transactional`.

## Dependencies

None added. Removes the `TransactionManager` import from
`workspace-mutation-context.ts`.

## Planned tests

- New `workspace-mutation-context.test.ts`:
  1. runs operation within transaction (BEGIN/COMMIT recorded, result returned)
  2. commits and propagates falsy results (`undefined`/`null`/`false`/`0`)
  3. rolls back and rethrows the original error instance (identity)
  4. rolls back and rethrows non-Error throws
- Delete `transaction-manager.test.ts` (4 tests: 2 retargeted above, 2 deleted).
- Run `pnpm typecheck`, `pnpm --filter @tuari/api test` (test:api), `pnpm lint`.

## Post-implementation hardening (debate round)

- **Seam decision:** `TransactionalRepository` is a standalone interface
  (`withTransaction` only) that `CompanyRepository` composes — consumers depend
  on the capability, not the aggregate; the signature lives in one place.
  Rejected the `Pick<CompanyRepository, "withTransaction">` alternative (critic:
  weak seam defined in terms of the aggregate it escapes).
- Removed dead re-export `export type { MutationAuditContext, RawAuditContext }`
  from WMC (zero importers; canonical home is `company.types.ts`).
- Updated stale docs that named `TransactionManager` as live architecture
  (`docs/ARCHITECTURE_REVIEW.md`, `docs/REFACTORING_TASKS.md`, `plans/t.md`).
- Dismissed (debate): "middle-man moved not eliminated" — WMC is a
  multi-responsibility bundle (audit + transaction helpers); deleting its
  `withTransaction` would scatter `repository` across ~31 call sites.
  Async-callback rejection is an adapter property — tracked in #232.

## Implementation risks

- **Hot surface:** any signature drift on `withTransaction` breaks ~33 call
  sites. Mitigation: unchanged signature, single-line body change; typecheck
  catches any drift.
- None other — pure deletion + one-line delegation.
