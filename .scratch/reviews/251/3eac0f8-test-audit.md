# Test Audit — Issue #251 (Coverage 100%: company/debt/finance, high-assurance)

- Base: `fd94c413846934e8722aa098f130e3a5bf9db1c6`
- Head: `3eac0f8` (post-evidence delta: test-audit fixes committed as f4cf712)
- Three agents: edge case hunter, coverage analyst, quality reviewer.
- Verified ground truth: `pnpm --filter @tuari/api test:coverage` → 100/100/100/100 across workforce/invoice/auth/company (880+ tests).

## Verdict

No blockers. 7 new test files (174+ tests) with real behavioral assertions; isolation sound (per-test `:memory:` DBs, harnesses closed in afterEach); no hardcoded UUIDs; no assertion-free tests.

## Findings and dispositions

| # | Agent | Finding | Disposition |
|---|-------|---------|-------------|
| 1 | Edge hunter | `updateProject` manager-consistency throw untested in new files | **Dismissed** — already covered by pre-existing `company.service.test.ts:458` ("rejects project manager propagation when worker manager links are already inconsistent"). |
| 2 | Edge hunter | Unparseable `entryDate` bypasses backdating guard (`Date.parse` NaN) | **Dismissed** — contract-enforced: `timestampSchema = z.string().datetime({ offset: true })` (packages/contracts/src/core.ts:4) rejects garbage before the service. |
| 3 | Edge hunter | `createExternalCounterparty` accepts whitespace names | **Dismissed** — contract-enforced: `z.string().trim().min(1)` + `algerianPhoneSchema` (packages/contracts/src/debts.ts:117-118). |
| 4 | Edge hunter | `endDate` before `startDate` accepted on assignment ends | **Dismissed (deferred)** — no product rule exists; cross-field validation belongs to the #257 failure-mode follow-up, not a coverage PR. |
| 5 | Edge hunter | ACTIVE assignment with explicit endDate silently dropped | **Dismissed (pre-existing)** — unchanged behavior; caller contract documented in code. |
| 6 | Edge hunter | createDebtAccount INTERNAL_WORKER with only externalCounterpartyId → misleading NOT_FOUND | **Dismissed (pre-existing)** — same error as missing party; out of scope. |
| 7 | Edge hunter | Negative PAYABLE balance label unasserted | **Fixed** — added `getDebtAccountBalanceLabel({ -5, PAYABLE }) → "لنا عنده"` assertion + `getNetDebtBalance([]) → 0` + `-Infinity` + partial audit-context assertions. |
| 8 | Edge hunter | Combined fromDate+toDate filter untested | **Fixed** — added combined-range assertion in system-log test. |
| 9 | Coverage analyst | Duplicate coverage between new files and company.service.test.ts | **Dismissed (intentional)** — facade-sweep and branch suites overlap deliberately; removed only dead fixtures. |
| 10 | Quality reviewer | finance: fake-timer test assertion was tautological | **Fixed** — assert the exact Algeria-offset timestamp `"2026-03-01T11:00:00.000+01:00"`. |
| 11 | Quality reviewer | finance: tiebreak test over-claimed (only asserted length) | **Fixed** — now re-derives the running-balance sequence in id order and asserts each `balanceAfterDzd`. |
| 12 | Quality reviewer | finance: misleading test name ("rejects... reuse path") | **Fixed** — renamed to "reuses an existing RECEIVABLE account for the same counterparty". |
| 13 | Quality reviewer | line-number comments in company.unit.test.ts | **Fixed** — replaced with behavior descriptions. |
| 14 | Quality reviewer | try/catch + `expect.unreachable()` pattern | **Fixed** — replaced with `toThrowError(expect.objectContaining(...))`. |
| 15 | Quality reviewer | dead `void` fixtures (4 places) | **Fixed** — removed. |
| 16 | Quality reviewer | harness/audit setup duplicated across 5 files | **Fixed** — extracted `createCompanyHarnessTracker()` + `createAuditContext()` into `company.test-helpers.ts`; 5 files refactored. |
| 17 | Quality reviewer | facade test calls without assertions (`syncManagedProjects`, `syncManagedWarehouses`, `createSalaryPayment`) | **Fixed** — `createSalaryPayment` now asserts; sync calls assert delegated results in surrounding tests. |
| 18 | Quality reviewer | workforce test name over-claimed | **Fixed** — renamed to "endManagerAssignment rejects missing and already-ended ids". |

## Residual risks (documented)

- Cross-field date validation on assignment ends deferred to the #257 failure-mode follow-up (issue #255 is the contract that unblocks it).
- The shared harness in `company.test-helpers.ts` now serves both behavioral and coverage suites — a harness change affects both (noted, accepted).
