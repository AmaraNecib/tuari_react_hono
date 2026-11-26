# #336 legacy payment robustness

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-72d44cc6-4eda5f6c2c47b581`
- Branch: `fix/336-legacy-payment-robustness-28524`
- Base: `baaca20ef708cdf5dfa31538e609f153254a3fba`
- Verification: `focused-local / CI-final-enforced`, as supplied by the parent. The parent reports an effective `develop` rule requiring strict CI acceptance, app 15368, with no bypass. This local task cannot establish hosted acceptance or merge readiness.
- Review tier: high-assurance. Duplicate payment identity can corrupt invoice and debt balances; cursor fallback can omit financial records.
- Review route: three distinct parent-owned initial lenses at the committed frozen scope. This is not routine-review eligible.
- Scope: only the two reproduced retained-legacy defects selected by the owner: typed atomic duplicate payment-ID rejection in memory and SQLite, and incompatible cursor fallback against the effective requested sort field.

## Domain and module design

A payment ID identifies one legacy payment row. Reusing that ID is a conflict, not an update or an idempotent replay. The `PaymentRepository.createPayment` interface owns the atomic insert decision: the in-memory adapter checks immediately before `Map.set`, while SQLite classifies only the `payment.id` primary-key constraint from the actual `INSERT`. The existing module sequence inserts the payment before debt, invoice, or allocation writes; retain that order so the conflict exits before those ports mutate. SQLite's existing transaction lock serializes same-connection calls. Memory's synchronous map check makes each insert decision atomic on the event loop. No generic transaction rewrite is in scope.

A cursor's `sortValue` must match the effective requested field, with `createdAt` as the default. `totalAmount` accepts a finite number. Date fields accept strings and retain the existing `null` cursor representation. Malformed, boolean, invalid-ID, and field-type-incompatible cursors behave as absent cursors. The legacy cursor wire shape has no field metadata, so same-type cross-field reuse cannot be distinguished; this fix does not invent a version or field property.

The module remains the small shared interface over memory and SQLite adapters. Tests cross `createPaymentModule.create` and `listPaged`, with an existing real-SQLite fixture and existing in-memory invoice/debt ports. No new product seam is needed.

## Verification and evidence

The prior read-only probe is retained at `D:/worktrees/tuari_react_hono/t3-f928e7dd-3884c0cf06b29726/.scratch/reviews/336-legacy/1795615821/runtime-results-1795616636635.json`. At source `b1930ae777fd8bcccc470f376af309511c5b73ca`, reusing the numeric amount cursor for date descending returned `[]` from SQLite instead of `[c,b,a]`; memory returned `[a]`. Date ascending returned `[a,b,c]` from SQLite but `[b,c]` from memory instead of `[a,b,c]`.

The new in-memory regressions failed before the implementation: duplicate create resolved and replaced the stored amount with `200`, concurrent duplicate calls both fulfilled, and incompatible date-sort cursor reuse returned `[b]` instead of `[a]`. The SQLite duplicate regression returned raw `SqliteError` with `SQLITE_CONSTRAINT_PRIMARYKEY` rather than a domain conflict. The initial SQLite cursor regression fixture omitted `updatedAt`; that test-data error was fixed before the green run. The original run logs remain under `.scratch/reviews/336-legacy-fix/red-28524-3/`.

The first donor test run used Node 26 and failed to load its Node 22 native SQLite binding (`NODE_MODULE_VERSION 127` versus 147). The installed Node 22.14.0 runtime uses ABI 127 and ran the real SQLite fixture. The contracts `src` tree differed from the donor, so I did not reuse donor `dist`; a narrow current-source contracts build succeeded with native exit 0. Its queue/start/end/PID record and logs are in `.scratch/reviews/336-legacy-fix/run-28524-contract-build-2/`. The failed command-syntax attempt is preserved separately under `.scratch/reviews/336-legacy-fix/run-28524/` and did not start a process.

Pre-commit proof on the working tree at base `baaca20ef708cdf5dfa31538e609f153254a3fba`:

- Focused legacy tests: `C:/Users/sensei57/AppData/Local/nvm/v22.14.0/node.exe D:/worktrees/tuari_react_hono/t3-72d44cc6-4eda5f6c2c47b581/node_modules/vitest/vitest.mjs run src/modules/payment/payment.module.test.ts src/modules/payment/payment.module.sqlite.test.ts src/modules/payment/adapters/payment.repository.test.ts --reporter=verbose`, exit 0, 3 files and 59 tests passed in 1.916 seconds. Logs: `.scratch/reviews/336-legacy-fix/precommit-28524-1/vitest.stdout.log` and `vitest.stderr.log`.
- ESLint on the eight changed TypeScript files: exit 0 in 3.661 seconds. Logs: `.scratch/reviews/336-legacy-fix/precommit-28524-1/eslint.stdout.log` and `eslint.stderr.log`.
- API `tsc --noEmit`: exit 0 in 16.578 seconds. Logs: `.scratch/reviews/336-legacy-fix/precommit-28524-1/api-tsc.stdout.log` and `api-tsc.stderr.log`.
- `check:unslop`: exit 0, 350 Markdown files scanned, 0 error-tier findings. Advisory warnings are repo-wide; this note and `docs/money/payment-robustness.md` added no warning. Logs: `.scratch/reviews/336-legacy-fix/unslop-28524-1/`.

The exact-money path already tests decimal `0.10 + 0.20` arithmetic. The legacy numeric module still uses JavaScript numbers and strict allocation-sum equality; the documentation records this behavior without changing rounding or monetary policy. The existing note documents legacy `deleteIfUnallocated` as a standalone awaited operation, not a participant in an outer transaction. Neither path changes here. No HTTP error mapping is claimed because this task does not exercise an HTTP handler.

Changed reviewable files:

- `apps/api/src/modules/payment/payment.module.ts`
- `apps/api/src/modules/payment/payment.types.ts`
- `apps/api/src/modules/payment/payment.repository.ts`
- `apps/api/src/modules/payment/adapters/payment.repository.ts`
- `apps/api/src/modules/payment/adapters/payment.repository.test.ts`
- `apps/api/src/modules/payment/adapters/in-memory-payment.repository.ts`
- `apps/api/src/modules/payment/payment.module.test.ts`
- `apps/api/src/modules/payment/payment.module.sqlite.test.ts`
- `docs/money/payment-robustness.md`
- `.scratch/implementation/336-legacy-fix-design.md`

No other source scope is authorized. After Guard Phase 1, commit exactly these paths, freeze source, then run affected proof and lint/typecheck against that committed SHA. Keep post-commit results in the ignored verification report; this committed note records the design and pre-commit proof.
