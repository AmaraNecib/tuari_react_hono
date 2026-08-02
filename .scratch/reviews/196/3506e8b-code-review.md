# Code review evidence — issue #196 (BootstrapPort)

**Head SHA:** `7dd2025`
**Base SHA:** `80d4926`
**Tier:** High-assurance
**Command:** `git diff 80d4926...HEAD` (commits 26ce5b3, 6747a42, 7dd2025)

## Process

Two parallel sub-agents (`reviewer`):
- **Standards** — diff against repo standards (`docs/slice-1-employee-deep-module.md`,
  `docs/architecture-decisions.md` + `docs/adr/`, `docs/development-workflow.md`,
  `docs/engineering-workflow.md`, `.agents/wisdom/*.md`) + Fowler smell baseline.
- **Spec** — diff against issue #196 acceptance criteria + issue body.

## Standards

**No hard violations.** Verified conformant:
- Deep-module pattern (`docs/slice-1-employee-deep-module.md`): 3-method port,
  service depends on the interface only, schema/SQL/transaction hidden in the
  adapter; userId/timestamps moved inside.
- Composition-root wiring in `createAppDependencies` (`.agents/wisdom/architecture.md`).
- Literal-widening wisdom: adapter returns annotated; test literals use
  `satisfies CreateFirstUserResult`.
- TS4058 wisdom: no exported function with an inferred `BetterSqliteDatabase`
  return type introduced (class ctor params are annotated positions).

Judgement-call smells (dismissed with reasons):
- **Middle Man** — `isBootstrapOwner` is a pure pass-through. Deliberate: the
  public surface is pinned for `rpc/router.ts`/`rpc-middleware.ts`
  (`Pick<AuthBootstrapService, ...>`); the port is the persistence seam and the
  service stays the domain API. Documented in design doc.
- **ADR-001 note** — the adapter writes better-auth-managed `user`/`account`
  tables via drizzle schema, where ADR-001 routes new auth persistence to
  `account.repository.ts`. Pre-existing behavior, not a new violation; the seam
  is the natural place to revisit in the parent #191 track. Noted in PR.

Fixed earlier (from debate): Duplicated Code (hasConfiguredUsers/
hasConfiguredUsersTx collapsed), constructor connection guard.

**Residual risk note:** the Standards sub-agent did not read the new adapter
test file; the full suite was run locally by the orchestrator (614/614 API
tests green).

## Spec

**All acceptance criteria satisfied:**

| # | Criterion | Verdict |
|---|-----------|---------|
| 1 | `BootstrapPort` in `bootstrap.types.ts` | ✅ 3-method interface per sketch |
| 2 | `SqliteBootstrapPort` in `adapters/sqlite-bootstrap.port.ts` | ✅ owns all Drizzle/SQLite/schema/crypto |
| 3 | Constructor no longer accepts `AppDrizzle`/raw | ✅ `(port, authInstance, bootstrapSetupKey)` |
| 4 | Service imports no drizzle-orm/better-sqlite3/schema | ✅ verified by inspection |
| 5 | All Drizzle/SQLite in adapter only | ✅ |
| 6 | `dependencies.ts` constructs the adapter | ✅ `new SqliteBootstrapPort(db, sharedDatabase)` |
| 7 | Compiles with no errors | ✅ `tsc --noEmit` exit 0 |
| 8 | Existing tests pass | ✅ intent-satisfied: test mock shape changed from Drizzle-db to port (the seam the issue introduces), all 5 old scenarios map 1:1, 33/33 auth tests + 614/614 API suite green. Flagged explicitly in design doc + PR |

- **Deviation** `{status:'created'|'conflict'}` vs sketch's `Promise<UserRecord>`:
  **justified and documented**. The old code returns the Arabic CONFLICT result
  (a non-exceptional outcome) for both "already configured" and the UNIQUE race,
  and COMMITs the empty transaction on in-tx conflict; a bare `UserRecord`
  would force conflict to be an exception and lose that behavior. Adapter
  reproduces the old semantics exactly (pre-check conflict → COMMIT → conflict;
  UNIQUE during insert → ROLLBACK → conflict; non-UNIQUE → ROLLBACK + rethrow;
  SQLITE_BUSY propagates).
- **Scope creep**: only the constructor connection guard (sound hardening,
  documented) + extra tests (not creep). No router/e2e changes.
- Setup-key validation and password hashing remain in the service; the port
  never sees the raw password. `BetterAuthInstance` remains a service
  dependency. Both match the issue body.

## Summary

Standards: 0 hard violations, 0 actionable smells (2 judgement calls dismissed
with reasons). Spec: 8/8 criteria met; 1 documented, justified deviation; 1
accepted hardening addition. No fixes required from this review.

## Post-evidence delta (head )

Rebased onto develop @ f362858 (CI hosted-runner migration — workflow file came from develop, not part of the PR diff).
Commits after the review round: dcb8c77 (empty re-trigger commit, no files), 3506e8b (test-only: raise createAppDependencies cold-start describe timeout 20000 -> 60000ms per .agents/wisdom/testing.md — mitigates the documented wiring-test cold-start flake that surfaced under the pre-push hook).
No production code changed since the reviews. Greptile: 5/5, no actionable findings.
