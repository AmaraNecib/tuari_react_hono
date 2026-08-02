# Debate evidence — issue #196 (BootstrapPort)

**Head SHA:** `7dd2025` (post-debate-fix HEAD)
**Base SHA:** `80d4926`
**Tier:** High-assurance (first-user bootstrap — auth/security)

## Process

Two parallel sub-agents:
- **Critic** (`reviewer` agent): find every flaw, scored 1-10.
- **Defender** (`oracle` agent): argue for the design, confidence-scored.

Both read `git diff 80d4926...HEAD`, the changed files, the design doc, and the
surrounding modules (recovery-key.service, drizzle.ts, schema, sqlite types,
company/invoice adapter patterns).

## Critic findings (11) and disposition

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | 5 | `db.$client === raw` connection identity unasserted — silent atomicity loss on mismatched injection | **FIXED** — constructor now fails fast when the handles don't share one connection (commit `6747a42`) |
| 2 | 4 | Blank/whitespace phone could create a "first user" that never counts as configured | **DISMISSED** — pre-existing; service input is `AuthBootstrapInput` whose `phone` is Zod-validated `algerianPhoneSchema` (`/^(05|06|07)\d{8}$/`) at the route boundary, so blank phones are unreachable in production. Adapter's empty-phone case is a synthetic trigger for the UNIQUE-race test. Referenced in PR. |
| 3 | 3 | Name-trim contract lives only in a docstring | **DISMISSED** — trimming is business normalization; the service owns it and the port docstring ("Trimmed display name") is the contract; test pins the service trim. |
| 4 | 3 | Transaction safety depends on the silent synchronous-driver assumption; cross-process race → SQLITE_BUSY → error | **FIXED (docs)** — adapter docstring now documents the single-connection/synchronous guarantee and the deliberate SQLITE_BUSY propagation; **test-audit** added a two-connection BUSY test |
| 5 | 2 | `{status:"conflict"}` conflates "already configured" with "race" | **DISMISSED** — matches old behavior exactly (both → same Arabic CONFLICT result); adding a `reason` field is scope creep for a no-behavior-change refactor. Noted in PR. |
| 6 | 2 | Broad `/UNIQUE constraint failed/i` regex over-maps future UNIQUE violations | **DISMISSED** — semantically correct for this transaction (any UNIQUE violation here IS a conflict); pre-existing regex. |
| 7 | 2 | `isBootstrapOwner` NULL-state-user_id fallback + createdAt-tie nondeterminism | **DISMISSED** — byte-identical to old behavior; NULL-state fallback now covered by a test (test-audit). |
| 8 | 2 | Convoluted double try/catch in `createFirstUser` | **FIXED** — collapsed to a single try/catch (behavior-identical) in `6747a42` |
| 9 | 1 | "Deep module" design terminology in shipped docstring | **FIXED** — reworded (commit `6747a42`) |
| 10 | 1 | Import ordering in dependencies.ts | **FIXED** — reordered (commit `6747a42`) |
| 11 | 1 | Two sequential SELECTs where one would do | **DISMISSED** — deliberate, preserves behavior identity (design doc) |

## Defender's strongest defenses (all accepted)

1. **Behavior preservation with a smaller surface** — statement order, COMMIT-on-conflict, UNIQUE→conflict, Arabic messages, hashing order all preserved verbatim; only the seam moved. Green 607-test suite + clean typecheck at the time.
2. **Discriminated union is the honest model** — "already configured" is a normal non-exceptional outcome; modeling it as a value (not an exception) is correct and testable. The issue's `Promise<UserRecord>` sketch would have forced an exception.
3. **Real-SQLite adapter tests upgrade the evidence** — from "mock called with 'BEGIN IMMEDIATE'" to a real DB atomically committing three rows / rolling back to zero on a UNIQUE race.
4. **Deep-module payoff** — service lost ~90 lines of persistence and its drizzle/better-sqlite3/schema/crypto imports; consumers beyond dependencies.ts untouched.

## Residual risks (accepted, documented in PR)

- Cross-process concurrent bootstrap surfaces as propagated SQLITE_BUSY (error), not a conflict result — pre-existing, deliberately unchanged, now pinned by a test.
- Only one concrete adapter exists; the in-memory adapter is the parent #191 track's direction.
- COMMIT-on-conflict kept for exact parity; ROLLBACK would be DB-equivalent.
- Service tests still pass the fake auth instance as `as never` (pre-existing repo pattern).

## Verdict

No blockers. 5 findings fixed, 6 dismissed (all pre-existing or deliberate), 0 deferred to issues.

## Post-evidence delta (head )

Rebased onto develop @ f362858 (CI hosted-runner migration — workflow file came from develop, not part of the PR diff).
Commits after the review round: dcb8c77 (empty re-trigger commit, no files), 3506e8b (test-only: raise createAppDependencies cold-start describe timeout 20000 -> 60000ms per .agents/wisdom/testing.md — mitigates the documented wiring-test cold-start flake that surfaced under the pre-push hook).
No production code changed since the reviews. Greptile: 5/5, no actionable findings.
