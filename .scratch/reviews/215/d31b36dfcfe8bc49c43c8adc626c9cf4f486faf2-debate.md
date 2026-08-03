# Debate — #215 (fold transaction wrapper chain)

**Head SHA:** `3e94e1c68f7133235813bb8435070d94a8baf43f`
**Base SHA:** `f93c37c0dd91646bfdc106c0e0bcc05b149b9e0c`
**Tier:** Standard (debate run as an extra adversarial round per request)

## Critic findings (severity 1-10)

1. **(3) Stale docs** — `docs/ARCHITECTURE_REVIEW.md:701,742,247`,
   `docs/REFACTORING_TASKS.md:388,400,405`, `plans/t.md:438,459` still named
   `TransactionManager` (and its async `transactionManager.execute`) as live
   architecture. → **FIXED**: docs rewritten to the folded sync
   `withTransaction` delegation; plans/t.md marked superseded.
2. **(3) Weak seam** — `Pick<CompanyRepository, "withTransaction">` defined the
   consumer seam in terms of the aggregate it claims to escape, hosted in the
   provider's contract file. → **FIXED**: standalone
   `interface TransactionalRepository` that `CompanyRepository` extends — the
   signature lives in one place, consumers depend on the capability.
3. **(2) "Middle man moved, not eliminated"** — WMC.withTransaction is itself a
   pass-through. → **DISMISSED** (defender): WMC is a multi-responsibility
   bundle (audit-context + transaction helpers) shared by every domain service;
   deleting its `withTransaction` would scatter `repository` across ~31 call
   sites. The class docstring's "per-service isolation" wording is loose but the
   bundle earns its keep.
4. **(2) Doc overclaims commit/rollback; async misuse** — better-sqlite3 is
   sync-only; a doc claiming "commit on success" could invite async callbacks.
   → **DISMISSED** (defender): the contract `(callback: () => T): T` is
   sync-typed; better-sqlite3 rejects async functions at transaction creation
   (throws, not silent commit). Async-contract pinning at the adapter seam is
   deferred to #232. Doc comment now reads "commit on success, rollback on
   error" — accurate for the sync contract.
5. **(1) Layering nit** — `TransactionalRepository` doc in provider contract
   module. → **RESOLVED** by the standalone-interface fix; the file header
   explicitly hosts "the focused repository interfaces" domain modules depend
   on, so the capability interface belongs there.

## Defender high points

- Fold = textbook Middle Man deletion (9/10): `execute` was literally
  `return this.repository.withTransaction(operation)`; deletion test holds
  (grep-clean).
- Pick→interface seam stays in lockstep, no drift, pays off immediately: the
  mock assigns without a cast (9/10).
- Structural compatibility at all 4 construction sites; typecheck guards the
  hot surface (9/10).
- Tests pin BEGIN/COMMIT + BEGIN/ROLLBACK sequences, falsy propagation, error
  identity, non-Error rethrow — strictly stronger than the deleted tests (9/10).

## Synthesis / actions

| Finding | Decision | Action |
|---|---|---|
| 1 (stale docs) | Fix | Committed (0bf8353 + 3e94e1c) |
| 2 (Pick seam) | Fix | Committed (0bf8353) |
| 3 (middle man) | Dismiss | Rationale in design doc; considered, not a defect |
| 4 (async contract) | Dismiss | Pre-existing adapter property; deferred to #232 |
| 5 (layering nit) | Fix (as part of 2) | Committed (0bf8353) |

Post-debate verification: typecheck 4/4, lint clean, `pnpm test:api` 636/636,
WMC test file 7/7.
