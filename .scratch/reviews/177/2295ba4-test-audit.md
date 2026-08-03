# Test Audit — issue #177 Phase 4 (debts workspace query segmentation)

**Base:** `f93c37c` · **Head:** `04d905b` · **Tier:** Standard
**Method:** three parallel sub-agents (edge case hunter, coverage analyst, quality reviewer)

## Findings & resolutions

| Finding | Risk | Resolution |
|---|---|---|
| One account's `debtEntriesList` failure discarded the whole party (sequential, unguarded) | 🟠 | Fixed: `Promise.all` over accounts (parallel); query errors as a whole so `isError` surfaces — covered by new test `propagates a debtEntriesList failure instead of discarding the party` |
| Query failure renders silent empty hub/ledger (no per-panel error UI) | 🟠 | Accepted: shell-level behavior is preserved (debts failure no longer blocks the whole workspace — a deliberate improvement over the composite coupling); per-panel error UI deferred |
| Synthetic `accountId` / null-id map collapse (`externalCounterpartyId ?? ""`) | 🟡 | Accepted: server guarantees non-null ids; `accountId` is a React key only |
| Tie-break test asserted output == input order (no-op sort would pass) | 🟡 | Fixed: feed rows in deliberately non-sorted order |
| `debtEntriesList` rejection untested | 🟡 | Fixed: added propagation test |
| `requireEntitySuccess` success-but-missing-item untested | 🟡 | Fixed: added test (`throws an AppMutationError when the party detail is missing its item`) |
| Negative worker balance → `owedByUsDzd` untested | 🟡 | Fixed: added test |
| `buildExternalCounterpartyRows` empty counterparties untested | 🟡 | Fixed: added test |
| Empty-summary externals test didn't assert `totalCaseCount` | 🟡 | Fixed |
| `partyId ?? "missing"` placeholder key untested | 🟡 | Fixed: added test |
| `disables when partyId or session missing` used mid-test `clearAllMocks` | 🟡 | Fixed: split into two isolated tests |
| E2E phone collisions across reruns | 🟡 | Fixed: deterministic per-run phone (`Date.now()` slice) |
| E2E test 2 serial reuse of test 1's counterparty | 🟡 | Accepted: safe under `workers: 1` / `fullyParallel: false`; hub sort puts the only non-zero account first |

## Quality grade

Unit suite: **A** — descriptive test names, all async assertions awaited,
`vi.hoisted` + `beforeEach` reset discipline, meaningful assertions
(exact totals, `toHaveBeenNthCalledWith` for the composition loop).

## Verification

- `apps/web/src/features/debts/debts-queries.test.ts` — 30 tests, pass.
- Full web suite — 371/371 pass (one transient #219 home-view timing flake
  observed under full-suite load, passes standalone and on re-run).
- E2E `tests/e2e/debts.spec.ts` — 2/2 pass (create counterparty → opening
  balance → ledger entry → hub balance → payment → balance update).
