# Issue #322 — Code Review Evidence

**Issue:** #322 — API: unlocked sync db.transaction() writers can be absorbed into open async transactions (High-assurance)
**Tier:** High-assurance
**Base:** `3c14490` (origin/develop) — **Head:** `90d7ce1` (final rebased HEAD after the fix loop; see post-evidence delta)
**Commits reviewed:** 8813d16 (main guard) → 4f87499 (update-history wiring) → 5847618 (debate fixes) → 9220829 (test-audit fixes) → ba746e5 (rebase + route sync tx through raw db.transaction under the FIFO lock).
**Verification performed:** full `apps/api` test suite (64 files / 1088 tests pass), `tsc --noEmit` clean, `eslint` clean on all changed files, `git diff origin/develop...HEAD` hunk-by-hunk.

## Standards

Sources: repo conventions as exercised in `docs/engineering-workflow.md`, `docs/development-workflow.md`, and the established fifo-lock/transaction-architecture patterns (#288); ESLint+Prettier (tool-enforced); TypeScript strict. No standalone CODING_STANDARDS.md exists; the baseline Fowler smell list applies as judgement calls below.

Findings:

1. **No documented-standard violations.** New members carry repo-style JSDoc blocks (fifo-lock.ts, all five adapters, account.repository.ts), Arabic user-facing error strings are preserved byte-for-byte, the shared-connection lock is threaded through the composition root exactly like the #288 pattern, and the shared `runSyncTransaction` util follows the repo's extract-shared-seam convention. Tooling (eslint, tsc) clean.
2. **Duplicated Code (judgement call)** — the gate-holder test scaffolding (`release`/`gate` promise + 10 ms sleep + `toThrow(FifoLockBusyError)`) is repeated in fifo-lock.test.ts, sqlite-company.repository.test.ts, update-history.service.test.ts and transaction-lock-guard.test.ts. Test-only; each suite is otherwise independent; acceptable — extraction would obscure the per-suite setup.
3. **Shotgun Surgery (judgement call)** — one logical change (route sync writers under the lock) touches 10 source files. This is inherent to threading a connection-wide lock through per-module adapters; the composition root (dependencies.ts :140-217) is the single place the instances are created, which keeps future changes localized. Not a violation.
4. **Middle Man (judgement call)** — `runSyncTransaction(lock, raw, fn)` is a thin delegate over `lock.runSync(() => raw.transaction(fn)())`. Justified: it is the *seam* that makes the guard un-forgettable for future modules (fifo-lock.ts :232-236) and keeps the better-sqlite3 typing in one place. Keep.
5. **Speculative Generality (judgement call)** — none: `timeoutMs` is real (validated, wired, tested, 30 s in the composition root), `FifoLockBusyError`/`FifoLockTimeoutError` are used by the error-mapping layer, and the optional-lock constructor defaults exist for a stated reason (~15 direct test constructions).
6. **Mysterious Name / Feature Envy / Data Clumps / Repeated Switches / Refused Bequest** — none observed in the diff.

## Spec

Source: issue #322 body (acceptance: detection mechanism or documented equivalent; every sync transaction writer under the connection-wide lock; absorb window eliminated; secondary: bounded wait) + `.scratch/implementation/322-design.md` + the #339 payment-validation requirement carried in the shared invoice files.

Findings:

1. **(a) Detection mechanism — implemented.** `FifoLock.runSync` throws `FifoLockBusyError` when another flow holds the lock; own-run join (ALS) and free-run are the two other modes (fifo-lock.ts :150-167). Matches the design §A and the acceptance criterion.
2. **(b) Every sync `db.transaction()` writer under the lock — implemented.** Verified by grep over the whole tree: company (11 sites + `withTransaction`), inventory (`withTransaction` + `createOutboundTransfer`), invoice-debt (`createInvoiceDebt`, `recordInvoicePayment`), invoice (`create`, `update`, `delete`), update-history plain write, and the already-locked payment `deleteIfUnallocated`. All route through `runSyncTransaction` → `lock.runSync`; the composition root passes one shared `connectionLock` to every opener and adapter (dependencies.ts :140-217; also `new InvoiceRepository(sharedDatabase, connectionLock, db)` :171).
3. **(c) Absorb window eliminated — implemented.** The account phone-change flow verifies bcrypt outside the transaction (account.service.ts :109-126, :159-198); the only previously-yielding locked tx no longer yields. Verified: every remaining `await` inside a locked `run` callback is a microtask-only drizzle/better-sqlite3 op.
4. **Secondary (bounded wait) — implemented.** `createFifoLock({ timeoutMs })` validates positive integer, `unref()`s the timer, rejects with `FifoLockTimeoutError` and abandons the slot; wired at 30 s in dependencies.ts :140.
5. **#339 payment validation intact in the shared invoice files — PASS.** Zero `packages/contracts` / `apps/api/src/modules/payment` files in the branch diff; the only edits to invoice.repository.ts / invoice-debt.port.ts are transaction-wrapping + lock-injection hunks (no logic changes); payment/invoice suites (200 tests) green.
6. **Scope creep — none.** All hunks serve the three acceptance items or their test evidence.
7. **Spec caveat (should-fix, not a failure)** — the guard line is drawn at `transaction()` sites + the update-history plain write; ~35 other plain sync `.run()` writers in the same adapters (company createRole/upsertEmployee/createDebtAccount/createDebtEntry/voidDebtEntry/assignment writers/history writers; inventory createItemDefinition/createInvoiceGroup/…; invoice updateStatus/markReceivedWithDebtAccount) remain outside `runSync`. The design's own mechanism section states plain writes also join an open transaction, and the update-history wrap ("for consistency") shows plain writes were in scope — so the boundary is applied inconsistently. Unreachable today under invariant (D), but the regression tripwire is incomplete. Recommend wrapping them in a follow-up (see debate D1).

## Summary

- **Standards axis:** 6 findings — no hard violations; 4 judgement calls (2 acceptable patterns, 1 test-only duplication, 1 inherent-to-pattern), 0 worst-case issues.
- **Spec axis:** 5 findings — all three acceptance items + the secondary item implemented and verified; #339 intact; 1 should-fix caveat (plain-write tripwire gap, D1) deferred to a follow-up; no scope creep.
- **Worst issue per axis:** Standards — none (all judgement calls, none blocking). Spec — the incomplete tripwire coverage of plain sync writers (deferred, documented).

---

## Post-evidence delta (evidence refresh to final HEAD)

This evidence was originally written against HEAD `ba746e5` and renamed to the
final SHA `90d7ce1` after the fix loop (per `.agents/wisdom/process.md`).

**Delta (`ba746e5` → `90d7ce1`): test-only hardening addressing this review's
own findings — no production code changed.**
- **test-audit T3 (should-fix):** fifo-lock timeout suite hardened against CI
  flake — describe timeout lengthened to 20s (matching the account lock-window
  suite) and the real-timer bounds widened (30/20/100ms → 150/100/500ms); the
  brief-wait test now has a 50x margin. Verified stable across 3 consecutive
  runs.
- **test-audit T4 (nit):** pinned the abandoned-slot + immediate-retry
  interaction — a caller that catches `FifoLockTimeoutError` and re-queues
  while the abandoned slot is still in line runs exactly once, in order.
- **test-audit T2 (nit):** re-pinned join-outer-with-open-transaction through
  the REAL sqlite invoice-debt port in `transaction-lock-guard.test.ts` —
  `recordInvoicePayment` joins our own locked transaction across a real yield
  and commits with it; a foreign holder rejects with `FifoLockBusyError`
  (surfaced as a rejection — the port method is async); post-release success
  asserted durably.
- **D1 (deferred):** unchanged — plain sync writers still unwrapped; follow-up
  issue to be noted in the PR body.

**Re-verification at `90d7ce1`:** `pnpm typecheck` exit 0; `pnpm test:api` 64
files / 1091 tests pass (was 1088 at `ba746e5`); `pnpm lint` exit 0; fifo-lock
and integration suites each stable across 3 consecutive runs.
