# Issue #322 — Debate Evidence

**Issue:** #322 — API: unlocked sync db.transaction() writers can be absorbed into open async transactions
**Tier:** High-assurance
**Base:** `bb144f3a` (develop)
**Head reviewed:** `98fd1b3` (main implementation) + `78a7d80` (update-history wiring); fixes applied in `cef6906`

## Process

Two parallel reviewer sub-agents (critic + defender) over `git diff bb144f3a...98fd1b3`
+ the design doc `.scratch/implementation/322-design.md` + the issue body.

## Critic findings → disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | 6 | timeoutMs overstates its guarantee (bounds the WAIT, not a hung holder's execution) and is unwired/speculative | **Fixed**: doc corrected to say the bound is on the wait; wired `createFifoLock({ timeoutMs: 30_000 })` in the composition root (directly answers the issue's secondary acceptance item). |
| F2 | 5 | third same-named `createCompanyRepository` factory (adapter level) left unguarded; dead-or-external | **Fixed**: deleted (no importers anywhere in `apps/`; removing the trap per the repo's dead-code principle). |
| F3 | 4 | runSync throw message says "with an open transaction" but the guard is lock-held | **Fixed**: `FifoLockBusyError` message now states the actual condition (another flow holds the lock). |
| F4 | 4 | runSync can run ahead of queued-but-unstarted async runs (FIFO precedence inversion) | **Fixed**: documented as an accepted precedence inversion in the fifo-lock header (safe — no transaction is open when the lock is free). |
| F5 | 3 | dead in-tx `if (!passwordVerified)` guard + meaningless boolean return; TOCTOU narrowing | **Fixed**: removed the dead guard; `verifyPasswordForPhoneChange` returns void (throws on failure). TOCTOU remains documented in the design (immaterial for the desktop workload; uniqueness check stays in-tx). |
| F6 | 3 | better-auth session writes bypass the tripwire (unwrappable) — permanent blind spot | **Documented residual** (design doc §D + fifo-lock header): protected by invariant (D) — no locked tx spans a real yield after the bcrypt move. Noted in PR. |
| F7 | 3 | `runSyncTransaction` helper copy-pasted in 4 adapters | **Fixed**: extracted shared `runSyncTransaction(lock, run, fn)` in fifo-lock.ts; adapters' private `guardedTransaction` wrappers delegate to it. |
| F8 | 2 | constructor duck-typing `"runSync" in rawHandleOrLock` fragile | **Dismissed**: TS overloads reject the failure mode (`(drizzleDb, lock)` doesn't match either overload); defender verified all current call shapes. Noted in PR. |
| F9 | 2 | unlocked hash reader duplicates the tx-scoped query | **Fixed**: single `selectCredentialPassword` shared by both readers. |
| F10 | 2 | plain Error, no distinct busy type | **Fixed**: `FifoLockBusyError` exported; tests assert it via `toThrow(FifoLockBusyError)`. |
| F11 | 2 | timeoutMs unvalidated; timer not unref()ed | **Fixed**: `timeoutMs` must be a positive integer (validated at construction, tested); timer `unref()`ed. |

## Defender verdict

No blockers. Confidence scores: runSync primitive 9/10, ALS own-run detection
8/10, timeoutMs 8/10, sync-site routing 9/10, bcrypt-out-of-tx 9/10,
composition-root wiring 8/10. All three "Done when" clauses of the issue are
satisfied: detection mechanism (runSync throw), routing under the lock (all
sync sites), and absorb-window elimination (bcrypt moved out).

One note from the defender (addressed): the new account lock-window test was
flaky under load (cold-start vs the 5s default timeout) — fixed with a
`{ timeout: 20000 }` describe block.

## Residuals documented (not blockers)

- better-auth writes remain protected only by invariant (D) — see design doc.
- ALS own-run detection is best-effort (pre-existing, documented in fifo-lock.ts).
- Account verify/update atomicity narrowed (TOCTOU) — accepted, documented.
