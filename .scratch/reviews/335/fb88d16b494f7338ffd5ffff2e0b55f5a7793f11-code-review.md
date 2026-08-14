# Code Review — Issue #335 payment_allocation FK RESTRICT (head `fb88d16`)

Two-axis review (`git diff origin/develop@3c14490...HEAD`, single commit
`fb88d16`), parallel Standards + Spec reviewer sub-agents. Spec source:
`.scratch/implementation/335-design.md` (committed design doc for this lane).
Standards sources: `AGENTS.md`, `docs/engineering-workflow.md`,
`.agents/wisdom/*.md` + Fowler smell baseline.

## Standards

**No hard violations of documented standards.**

- `AGENTS.md` commit staging discipline — commit `fb88d16` contains only
  source, tests, and the issue design doc; no scratch noise. Satisfied.
- `AGENTS.md` issue-closing convention — commit body says "part of #335",
  not "Closes". Satisfied.
- Engineering workflow (TDD / acceptance tests) — raw-delete loud-failure and
  unallocated-delete acceptance tests added, plus migration/idempotency/
  fast-path tests. Verified 63/63 tests in the 3 changed files, full API
  suite 1076/1076 green, typecheck + lint clean.

**Baseline smells (all judgement calls):**

- `schema.ts:1433-1444` (rebuild DDL) — **Duplicated Code / Divergent
  Change**: CREATE TABLE duplicates `schema-definitions.ts:640-650`; the
  constraint now lives in 3 spots (schemaStatements DDL, migration DDL,
  drizzle `schema/payment.ts`). Matches every prior rebuild migration in the
  same file (`repairLegacyAuthTables`, debt migrations) and is disclosed in
  a code comment + design doc; the drizzle table is unused at runtime.
  **Accepted tradeoff, not a violation.**
- `schema.ts:1466-1468` (`runPaymentAllocationRestrictMigration`) — **Middle
  Man** one-line wrapper; consistent with all sibling migration wrappers.
  Dismissed.
- `schema-migrations.test.ts:93-121` — reworked `$transaction` test helper
  to savepoint + real `await` (old impl returned before async work settled):
  a genuine correctness improvement, not a smell.
- No Mysterious Name, Feature Envy, Data Clumps, Primitive Obsession,
  Repeated Switches, Shotgun Surgery, Speculative Generality, Message Chains,
  or Refused Bequest.

**Residual standard-level risk:** `schema.ts:1411` fast path uses a naive
whole-table `includes("ON DELETE RESTRICT")`; only the payment_id FK can be
RESTRICT today, so false-positive risk is low (see Spec/debate SHOULD-FIX).

## Spec

**All requirements in the design doc are implemented; no missing or partial
requirements.**

- FK `ON DELETE RESTRICT` in fresh-DB DDL (`schema-definitions.ts:646-647`)
  and in the migration rebuild DDL (`schema.ts:1439`); drizzle
  `onDelete: "restrict"` (`schema/payment.ts:30`) — matches spec bullets
  "FK `ON DELETE RESTRICT` on `payment_allocation.payment_id`" and
  "`references(() => payment.id, { onDelete: \"restrict\" })`".
- Idempotent `applyPaymentAllocationRestrictMigration` exported + wrapper,
  wired into `ensureDatabaseSchema` after the debt migrations
  (`schema.ts:1720`) — matches spec "wired into `ensureDatabaseSchema` after
  the debt migrations". Key-guard skip, fresh-DB fast path (`sqlite_master`
  check), single savepoint transaction with `PRAGMA foreign_keys` OFF
  outside / ON in `finally`, state key inserted inside the txn, both indexes
  recreated — all match spec bullets.
- Critical checks: (1) raw delete fails loudly — `payment.repository.test.ts:375-387`
  plus post-migration assertion `schema-migrations.test.ts:618-625`;
  (2) `deleteIfUnallocated` untouched by the diff; #289 tests unchanged and
  green; (3) migration runs before `ensureSeedRoles`, touches only
  `payment_allocation`, failure rolls back and retries next startup;
  (4) only `DELETE FROM "payment"` in src is the guarded port
  (`payment.repository.ts:224`).
- Tests listed in the spec's "Planned tests" items 1-4 all present; item 5
  (guarded-delete regressions stay green) relies on pre-existing tests,
  which pass.

**Scope creep (one item, justified):** `schema-migrations.test.ts:93-121`
rewrites the `asDbExecutor` harness to savepoint-based transactions beyond
the spec's "Files touched" description. Justified — the old harness ran the
async work after the sync `db.transaction` committed (latent bug: assertions
could observe a half-applied migration, late rejections became unhandled).
The rewrite mirrors the production `BetterSqlite3Executor`.

**Implemented but wrong:** none found.

**Deviations/notes:** rebuild drops any ad-hoc (non-schemaStatements)
indexes on `payment_allocation` (only the two known indexes recreated — per
spec); `invoice_id` CASCADE remains (explicitly out of scope, follow-up
noted in design doc). Cosmetic: stray leading space before `/**` at
`schema.ts:1466` (lint-clean, matches sibling style).

## Summary

- **Standards:** 0 hard violations; 2 judgement-call smells (Duplicated Code
  on rebuild DDL — accepted tradeoff; Middle Man wrapper — dismissed). Worst:
  DDL duplicated across 3 files (mitigated by explicit disclosure).
- **Spec:** 0 missing/partial requirements; 0 wrong implementations; 1
  justified scope-creep item (test-harness correctness fix). Worst:
  `alreadyRestrict` fast-path heuristic is the single lynchpin for fresh-DB
  handling (SHOULD-FIX, latent).
