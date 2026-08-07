# Test Audit — Issue #249 (high-assurance)

- Base: `bb49ec29335adb1564ba69bc7f1d91a2e9f43b33`
- Head at time of review: `8626e9b` → final head `ff02d2d` (+ audit-fix commit)
- Three parallel sub-agents: edge-case hunter, coverage analyst, quality reviewer

## What was audited

- `apps/api/src/modules/payment/payment.module.test.ts` (+ payment.module.ts)
- `apps/api/src/modules/account/account.service.test.ts` (+ account.service.ts)
- `apps/api/src/modules/account/account.repository.test.ts` (+ account.repository.ts)

## Findings and disposition

### Edge-case hunter

| # | Risk | Finding | Disposition |
|---|---|---|---|
| 1 | 🔴 | Empty allocations + zero total creates a phantom payment (no `allocations.length > 0` / `totalAmount > 0` check) | **Deferred → #289** (payment validation issue; module behavior untouched by this coverage PR) |
| 2 | 🟠 | Zero/negative amounts bypass all guards | **Deferred → #289** |
| 3 | 🟠 | In-memory `runInTransaction` is a passthrough — no rollback test | **Deferred → #288** (rollback lives in the sqlite adapter, which is excluded/untested — tracked) |
| 4 | 🟠 | Negative `limit` in `listPaged` drops the last item | **Deferred → #289** |
| 5 | 🟡 | `delete` TOCTOU (findById → findAllocations → deletePayment non-atomic) | **Deferred → #289** |
| 6 | 🟡 | Cursor `{id}` without sortValue | Covered by sibling bad-type test (identical branch); skip |
| 7 | 🟠 | Whitespace-only `currentPassword` branch untested | **FIXED** — added test (400) |
| 8 | 🟡 | Session user with id missing but phone present | **FIXED** — added test (401) |
| 9 | 🟡 | Name boundary 120 (exact valid) + empty name with phone | **FIXED** — added both tests |
| 10 | 🟡 | Non-string phone silently dropped (defensive normalization) | Intended behavior; skip |
| 11 | 🟠 | History-write failure atomicity at service level | Repo-level rollback pinned; service propagates; skip |
| 12 | 🟠 | Lock release after failure untested (deadlock risk) | **FIXED** — added post-failure `withTransaction` call |
| 13 | 🟡 | `updateUserProfile` with neither name nor phone | **FIXED** — added test (updated_at only) |
| 14 | 🟡 | `passwordChanged: 0` explicit | Same branch as omitted; skip |

### Coverage analyst

- All 4 acceptance criteria verified: include covers both modules; 100% thresholds pass; tests assert behavior; typecheck + test:api + lint green.
- Diversity high; only minor duplication (two null-name actor-label tests overlap).
- Repository tests assert real persisted state (raw SQL reads on live connection) — strongest file.
- **Weak cursor-fallback assertions** (single payment made fallback indistinguishable from cursor-applied) → **FIXED** (2 payments, both asserted).
- Default-sort paging asserts count/nextCursor not order → covered by the numeric-sort follow test; skip.

### Quality reviewer (grade B+)

- Dead `makeInvoiceInput` + unused `afterEach` → **FIXED** (removed).
- `debtPort.state...` internal-shape coupling — pre-existing test-hook usage; skip.
- 5× inlined invoice-setup duplication → extract helper; pre-existing style, deferred (noted).
- 18× mock-construction duplication in account.service.test.ts → factory refactor; consistent with the file's pre-existing inline style; deferred (noted).
- Phone-change success test didn't assert `password.verify` called → **FIXED** (asserts called with hash + password).
- 10ms timing in FIFO test → gate-based design, low flake risk; accepted.

## Follow-up issues created

- **#288** — shared-connection transaction model hardening (from debate; includes payment adapter tx tests = edge-hunter #3).
- **#289** — payment input validation (zero/negative amounts, empty allocations, negative limit, delete TOCTOU).

## Post-audit verification

- `pnpm exec vitest run --coverage` (apps/api): 49 files / **734 tests**, 100/100/100/100 (370 stmts, 233 branches, 77 funcs, 346 lines).

## Post-evidence delta (ff02d2d → 20bc48e)

- `20bc48e`: string/null sortValue cursor tests strengthened to assert the
  cursor row is skipped (decode-success distinguishable from fallback) —
  addresses the coverage-analyst + code-review weakness. Re-verified 100/100/100/100.
