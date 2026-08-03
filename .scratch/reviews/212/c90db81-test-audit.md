# Test Audit — Issue #212 (config unification)

**Base:** `f93c37c` | **Head:** `1530d6c` | **Tier:** Standard

Ran 3 parallel review agents (edge-case hunter, coverage analyst, quality reviewer)
against `git diff f93c37c...HEAD`.

## Findings applied (committed in 1530d6c)

| Finding | Severity | Action |
|---|---|---|
| Port bounds (`<=0`, `>65535`) untested — the strictness is a headline fix of the issue | 🟠 | Added `rejects out-of-range API_PORT values (must be 1..65535)` to `config.test.ts` |
| `BETTER_AUTH_URL` derived from overridden port untested | 🟡 | Added `derives BETTER_AUTH_URL from an overridden API_PORT` |
| Real `createAuth(db, config)` branch never executed (all tests passed `fakeAuth`) — a revert of `auth.ts` to `env.*` would pass CI | 🟡 | Added `builds the real auth instance from the injected config when none is passed` |
| Null setup-key default path untested | 🟡 | Added `defaults to no bootstrap setup key when the config has none` |
| Setup-key test could pass against old code if ambient `BOOTSTRAP_SETUP_KEY` were set | 🟡 | Hardened with `vi.stubEnv("BOOTSTRAP_SETUP_KEY", undefined)` |
| Test-name spelling "honours" vs repo's American style | 🟡 | Renamed to "honors" |

## Verdicts

- Edge case hunter: no 🔴; the port-bound and derived-URL gaps closed.
- Coverage analyst: no blockers; structural criterion (zero legacy imports) verified by grep.
- Quality reviewer: **Grade A** for the test file; vi.mock/vi.hoisted/importOriginal pattern sound,
  `mockClear` isolation correct, workaround removal is an isolation improvement.

## Accepted residual risks (documented, not fixed)

- `createBootstrapSchemaDb` hand-written DDL duplicates migration tables — low risk (only
  SELECT counts run against it).
- Mock asserts constructor argument — intentional coupling to prove the wiring point.
- `createAuth`/`index.ts` wiring at the composition root is exercised by the E2E smoke spec,
  not unit tests.

## Flake note

`sqlite-bootstrap.port.test.ts` "propagates a cross-connection write-lock contention" (5s
default timeout) intermittently times out under full-suite parallel load. Reproduced on this
worktree; base `f93c37c` ran 633/633 clean twice and this worktree passed 628/628 in two
subsequent full runs. The test file and its import chain are untouched by this change; the
failure is the known cold-load/timeout pattern documented in `.agents/wisdom/process.md`.
Tracked for a follow-up (raise the contention test timeout), not fixed here to keep scope tight.

---

## Post-evidence delta (b560faf)

Head moved from `1530d6c` → `b560faf` (code-review round, commits: "Align schema port
bounds with factory, document createAuth params"). Delta only:
- `appConfigSchema.port` gained `.max(65535)` — closes the boundary gap the audit's
  edge-case hunter flagged as untested (now factory AND schema reject out-of-range ports).
- `createAuth` JSDoc `@param` docs added; one test comment softened (no behavior change).
- New schema-level port tests added to `config.test.ts` (accept 8080, reject 0 / 65536).

No test behavior removed or weakened; suite green at head (api 631, web 341).

---

## Post-evidence delta (7459eb4 — final head)

Head moved b560faf → f2b4eeb (coverage round: test-only additions in config.test.ts,
loader.test.ts, url.test.ts, dependencies.test.ts — no production code changed) →
7459eb4 (wisdom docs). Production code under review is unchanged since b560faf;
Greptile re-reviewed the final head (5/5, no actionable findings). Coverage round
closed the remaining in-scope branches (API_HOST trim, truthy-variant case-insensitivity,
CSV empty segments, pg_ssl false, normalizeOrigin empty/protocol-without-host, omitted
sqlite fallback). Deferred branches tracked in #259.

---

## Post-evidence delta (c90db81 — final evidence commit)

Evidence commit c90db81 (this rename + PR body) is scratch-only; Greptile re-review on
the final head covers c90db81, matching the PR head exactly.
