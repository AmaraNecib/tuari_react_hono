# Test Audit — #215 (fold transaction wrapper chain)

**Head SHA:** `70989ed144d0c260898c1f31f841916c65362796`
**Base SHA:** `f93c37c0dd91646bfdc106c0e0bcc05b149b9e0c`
**Diff:** `git diff f93c37c...HEAD -- apps/api/src/modules/company/`

## Scope audited

- `apps/api/src/modules/company/workspace-mutation-context.test.ts` (new — 2 tests)
- `apps/api/src/modules/company/workspace-mutation-context.ts` (folded delegation)
- `apps/api/src/modules/company/company.repository.contracts.ts`
- `apps/api/src/modules/company/sqlite-company.repository.ts` (withTransaction impl)
- Deleted: `transaction-manager.ts`, `transaction-manager.test.ts`

## Three parallel agents

### Edge Case Hunter
- 🟠 **Async operations — mock diverges from real adapter.** The sqlite adapter is
  `this.raw.transaction(callback)()`; better-sqlite3 rejects async callbacks at
  wrapper creation. The new mock accepts and "succeeds" an async callback.
  **Assessment: pre-existing property of the seam** — `withTransaction<T>(operation: () => T): T`
  had the identical sync-typed signature and delegation before the fold; the fold
  changed nothing here. A pinning test on the mock would test the test double, not
  the code (WMC is provider-neutral; the in-memory adapter may behave differently).
  Deferred — adapter-level concern, tracked for follow-up.
- 🟡 Falsy/zero return propagation (works in both layers; unchanged by fold) — advisory.
- 🟡 Non-Error throw identity (`toThrow(message)` vs `toThrowError(err)`) — advisory.
- 🟡 Nested transactions (per-service isolation claim; savepoint semantics live in
  the adapter, not the fold) — advisory.
- 🟡 `createMutationAuditContext` authorizer path untested at unit level
  (covered at router.test.ts integration level) — pre-existing, out of scope.
- No 🔴 findings.

### Coverage Analyst
- All four "Done when" criteria of #215 have coverage / verification:
  TransactionManager deleted (grep clean), dead surface gone (executeMultiple +
  transactional had zero callers), WMC.withTransaction delegates directly
  (one-line body, signature unchanged), tests green (49 files / 631 tests).
- No duplicate coverage: sqlite-company.repository.test.ts, company.service.test.ts,
  router.test.ts have no withTransaction unit tests; account.service.test.ts covers a
  different (async, tx-param) seam. New file is the only unit test at the WMC seam.
- Nit: design doc claimed 33 call sites; measured 31 (fixed in doc).

### Quality Reviewer — Grade A-
- Retargeting faithful: 2 old `execute` tests recreated 1:1 at the exact fold seam.
- Assertion quality improved over deleted tests: now pins
  `["BEGIN","COMMIT"]` / `["BEGIN","ROLLBACK"]` sequences + rethrow, not just results.
- Sync-typed tests; no async leakage. Isolation via `beforeEach`.
- Minor notes: mock self-implements BEGIN/COMMIT/ROLLBACK (same as the deleted tests —
  no regression); `as unknown as CompanyRepository` cast unavoidable given the
  4-interface union. Follow-up (pre-existing, out of scope): an integration-level
  rollback test for the sqlite company adapter.

## Synthesis / actions

- No 🔴 findings; no "Fix it" items. Deferred items (all pre-existing or
  adapter-level, none introduced by the fold):
  1. Async-callback rejection contract is an adapter (better-sqlite3) property;
     consider a future integration test at `sqlite-company.repository` seam.
  2. Adapter-level rollback integration test for the company repo (mirrors
     `sqlite-recovery-key.port.test.ts` pattern).
  3. Unit coverage for `createMutationAuditContext` authorizer path.
- Full suite: `pnpm test:api` 49 files / 631 passed; `pnpm test:web` 45 files / 341
  passed; typecheck + lint green.

---

## Post-evidence delta (70989ed → 3e94e1c)

Hardening round after the initial audit (commits 984077e, 0bf8353, 3e94e1c):

- **5 edge-case tests added** at the WMC seam (per user request + audit 🟡 items):
  - `it.each([undefined, null, false, 0])` — falsy results propagate AND COMMIT
    (guards a naive `if (result)` regression)
  - rollback + rethrow of the **original error instance** — true identity via
    capture-and-`toBe` (vitest's `toThrowError(ErrorInstance)` is structural,
    not identity)
  - rollback + rethrow of **non-Error throws** (thrown string)
- **Seam hardened:** `TransactionalRepository` changed from
  `Pick<CompanyRepository, "withTransaction">` to a standalone interface that
  `CompanyRepository` extends (debate critic: Pick defined the consumer seam in
  terms of the aggregate it escapes; interface keeps the signature in one place).
- Test mock no longer needs `as unknown as CompanyRepository` — typed directly
  as `TransactionalRepository` (resolves the code-review judgement call).
- WMC dead re-export (`MutationAuditContext`/`RawAuditContext`) removed — zero
  importers verified; canonical home is `company.types.ts`.
- Full suite re-verified: `pnpm test:api` 636/636, typecheck clean, lint clean.

The 3-agent audit findings (async-contract pin, adapter rollback integration
test, `createMutationAuditContext` unit coverage) remain deferred to #232 —
none are introduced by this delta.

---

## Post-evidence delta (3e94e1c → d31b36d, test-only)

Coverage round (per reviewer/user feedback that tests were happy-path-only):

- **`sqlite-company.repository.test.ts` +4 tests** — the REAL production adapter's
  `withTransaction` (previously zero direct coverage):
  - commits multi-table writes on success (employee + manager assignment durable after)
  - rolls back ALL writes when the callback throws (assert 0 employees remain)
  - rethrows the original error instance (identity)
  - rejects async callbacks loudly (`/cannot return a promise/`, nothing written) —
    empirically verified better-sqlite3 behavior
- **`workspace-mutation-context.test.ts` +5 tests** — `createMutationAuditContext`
  (previously only exercised via router.test.ts integration):
  - normalizes absent context (fills transactionId UUID)
  - preserves provided fields + supplied transactionId
  - rejects non-bootstrap-owner with `CompanyError` code UNAUTHORIZED
  - allows the bootstrap owner
  - rejects anonymous actor when authorizer configured
- Full suite: `pnpm test:api` 645/645 (was 636), typecheck clean (incl. direct
  `tsc --noEmit` on api), lint clean. Test-only round — zero production changes.
