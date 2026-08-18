# Code review + test audit — issue #175 (migration/recovery lane)

- HEAD reviewed: `15f48c8` (branch `feature/issue-175-migration-recovery`)
- Base: `origin/develop` @ `6be3497`
- Scope: `git diff origin/develop...15f48c8` = 2 files:
  - `apps/api/src/infrastructure/database/migration-recovery.test.ts` (+ new, 6 tests)
  - `.scratch/implementation/175-migration-design.md` (decision record)
- Mode: local-only. Reviewer sub-agent (user `reviewer`, fresh context) ran
  against the committed diff; its findings were then addressed and checks
  re-run on the final HEAD (see "Post-review deltas").

## Standards axis — PASS

Independent reviewer verdict (run id d5b3954d, against d0ca930): PASS on repo
test standards — honest assertions probing real DB state (PRAGMA table_info /
index_list / sqlite_master / row values), correct vitest async matchers
(`await expect(...).rejects.toThrow`), real `BetterSqlite3Executor` on
`:memory:` DBs (no fakes), deterministic, resource-safe (in-memory DBs, no
files), consistent with sibling suites (`migration-runner.test.ts`,
`schema-migrations.test.ts`, `schema-definitions.test.ts`). Lint clean.

## Spec axis — PASS with minor findings (all addressed)

Reviewer findings on the first implementation and the disposition:

1. **minor** — the failing statement IS the state-key insert, so the
   "key not recorded" assertion is implied by the failure point; the
   independently meaningful check is that earlier DDL/DML rolled back.
   → ADDRESSED: file header now documents this coverage boundary explicitly;
   every test still asserts the rollback of prior DDL/DML (rename, index swap,
   table rebuild, role deletion) as the primary invariant.
2. **minor** — the retry test used a fresh DB instead of retrying the same
   failed DB. → ADDRESSED: retry tests now drop the injected trigger and
   re-run on the SAME database (true next-startup story) for the rename and
   the RBAC migrations.
3. **nit** — planned employee-link failure test absent. → Dropped by design:
   SQLite accepts `ADD COLUMN ... REFERENCES` to a missing table without
   throwing and that migration records no state key; a forced failure would
   be artificial. Documented in the design doc.
4. **nit** — index-only assertions can't distinguish "rolled back" from
   "statements deleted". → Accepted: mitigated by the existing happy-path
   coverage in `schema-migrations.test.ts`; noted in-line.

Greptile's own review of the final HEAD (`15f48c8-greptile-local.md`) found
ZERO comments on this change set; its two attention-file claims are verified
pre-existing and out of scope (see Greptile evidence).

## Test audit (assertion quality, edge cases, failure/empty states)

- Positive path covered elsewhere; this suite pins the FAILURE mode + recovery:
  mid-transaction abort at the state-key insert.
- Rollback checked against concrete observable state: column names (rename),
  index inventory (index swap), sqlite_master table list + table DDL + row
  values (table rebuild), role/permission/employee rows (destructive RBAC
  migration) — no tautological assertions (e.g. no "executed === 0" without a
  schema check).
- Empty/edge states: empty `app_schema_state` on failure (asserted via
  `stateKeys`), same-DB retry records the key exactly once (`toEqual([key])`).
- One known asymmetry (documented): key-not-recorded is implied by the failure
  point; the rollback-of-prior-work assertions are the independent evidence.

## Post-review deltas (after evidence regeneration rules)

- `d0ca930` — initial 5-test implementation (extra-NOT-NULL-column injection).
- `15f48c8` — reviewer-driven refactor: trigger-based failure injection
  (realistic DB shape), same-DB retry recovery tests, coverage-boundary doc.
  Full local checks re-run on this HEAD: contracts build ✓, API typecheck ✓,
  API lint ✓, full API suite 1176 passed / 1 skipped ✓.