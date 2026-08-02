# Code Review — issue #194 (pre-push self-review)

**Head SHA:** `fa9e7f0b9fe393fe6d344f9c9547ecc638ff2ad5`
**Base SHA:** `80d4926f029c3facee7dd17eb28da174c6e01f3b`
**Commits reviewed:** `fa9e7f0` (Introduce UpdateHistoryPort behind UpdateHistoryService, closes #194)
**Diff:** `git diff 80d4926f029c3facee7dd17eb28da174c6e01f3b...HEAD`

## Standards

Standards sources: `docs/ARCHITECTURE.md`, `docs/engineering-workflow.md`,
`.agents/wisdom/architecture.md` (composition-root principle), established
ports & adapters convention (`invoice.types.ts` → `InvoiceDebtPort`,
`adapters/invoice-debt.port.ts`, `payment-module.interface.ts`), wisdom on
TS4058 (dts build) and env-at-module-load.

**No hard violations of documented standards.**

Verified correct:
- Port interface in the module types file — matches `InvoiceDebtPort` convention.
- SQLite impl in `modules/update/adapters/` — mirrors `invoice-debt.port.ts` placement.
- Composition-root wiring in `dependencies.ts:153` — storage flows through the
  composition root only; `AppDependencies` stays explicitly typed (no TS4058
  regression); the port is not exposed on `AppDependencies`, only the service
  (consistent with the invoice module).
- SQL moved verbatim; normalization and ordering preserved; test assertions
  byte-identical except the constructor line; test never imports
  `dependencies.ts` (env-at-module-load rule N/A).

Judgement calls (non-blocking):
- **Middle Man:** the service is now a pure pass-through facade. Justified —
  `rpc/handlers/update.ts` and `rpc/router.ts` consume the `UpdateHistoryService`
  type, and the issue explicitly requires the service to depend on the port.
- **limit=50 default** relocated to the adapter; behavior preserved and now
  documented in the port JSDoc.
- **Class vs factory:** repo convention is mixed (SqliteRoleRepository,
  SqliteEmployeeRepository, PaymentRepositoryImpl are classes); not a violation.
- **Duplicated SELECT** (history vs latest): pre-existing, moved verbatim, not
  introduced by this diff.
- **Speculative Generality** (single port impl): justified by the #191
  persistence-boundary roadmap and InvoiceDebtPort precedent.

## Spec

Spec: GitHub issue #194 (verbatim interface snippet + 7 acceptance criteria),
constraint "no behavior changes; existing tests pass unchanged".

**(a) Missing/partial:** none.
**(b) Scope creep:** none behavioral. `.scratch/implementation/194-design.md`
design doc is tracked — standard workflow artifact.
**(c) Wrong implementations:** none.

Verified:
1. Interface byte-identical to the spec snippet; uses `@tuari/contracts` types.
2. Adapter at the required path; all three raw SQL statements moved verbatim.
3. No SQL or `BetterSqliteDatabase` left in the service; three one-line delegations.
4. Composition root wires `new UpdateHistoryService(new SqliteUpdateHistoryPort(sharedDatabase))`.
5. No behavior drift — every method body compared against
   `git show 80d4926:.../update-history.service.ts` (identical SQL, param
   binding, `lastInsertRowid` cast, `success === 1` normalization, ordering,
   `limit = 50` default).
6. Test diff is exactly the permitted 2 lines (import + construction);
   assertions byte-identical. `tsc --noEmit` clean; 9/9 update tests pass.

Residual risks (accepted): adapter covered only through the service suite
(acceptable given "no behavior changes"); `lastInsertRowid as number` cast
carried over (pre-existing).

## Verdict

**Standards: 0 actionable findings** (2 non-blocking judgement calls).
**Spec: 0 actionable findings.** Safe to push.
