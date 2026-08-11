# Debate evidence — issue #289 (payment validation)

**Tier:** High-assurance (financially-adjacent)
**Base:** `bb144f3` (origin/develop)
**Head:** `30f6e38` (evidence covers the final reviewed head; post-debate fix commit included)

## How it ran

Two parallel `reviewer` sub-agents on `git diff bb144f3...30f6e38` +
`.scratch/implementation/289-design.md` + issue #289 spec:
- **Critic** (harsh): every flaw, scored 1–10
- **Defender** (charitable): argued for the design with confidence scores

## Critic findings → decisions

| # | Sev | Finding | Decision |
|---|---|---|---|
| 1 | 6 | `deleteIfUnallocated` used `db.transaction()` (deferred BEGIN) — cross-process, the guard's COUNT could read a pre-create snapshot and the upgraded DELETE would cascade-remove the concurrent create's fresh allocations (gap-4 corruption re-opened for a second process) | **FIXED** — `transaction.immediate()` (write reservation at BEGIN, mirrors `runInTransaction`'s `BEGIN IMMEDIATE`); comment documents why |
| 2 | 3 | In-memory adapter comment claimed concurrency parity with sqlite; its pass-through `runInTransaction` means module-level create/delete CAN interleave (unlike sqlite) | **FIXED** — comment now states the honest divergence; no-await guard inside the method is still atomic |
| 3 | 2 | `paymentsList` hand-rolled try/catch mapping is a one-off vs the withAudit mappers on create/delete | **FIXED** — comment documents the deliberate asymmetry and the future refactor note |
| 4 | 2 | Nothing structurally asserts the module imports the contract schemas (a local copy would pass tests) | **DISMISSED** — inherent to import reuse; wire tests pin the gate, module tests pin the seam, drift needs editing both; noted in PR |
| 5 | 2 | `payment_allocation.payment_id` FK `ON DELETE CASCADE` (pre-existing) becomes load-bearing: a raw `DELETE FROM payment` bypassing the port still cascade-deletes allocations while the invoice stays PAID | **DEFERRED** — follow-up issue **#335** |
| 6 | 1 | Error precedence: `{ totalAmount: 0, allocations: [] }` reports `PaymentInvalidAmountError`, not `PaymentEmptyAllocationsError` (both BAD_REQUEST) | **DISMISSED** — cosmetic; tests pin the order |
| 7 | 1 | `amount`/`limit` error payloads typed `number` can carry NaN at runtime ("received NaN") | **DISMISSED** — cosmetic; safeParse failures on non-numbers |

## Defender highlights (accepted)

- Shared contract primitives (`paymentAmountSchema`/`paymentListLimitSchema`) reused at the seam — single validity definition for wire gate + module (confidence 9)
- Discriminated `PaymentDeleteResult` with count from inside the atomic transaction — no follow-up read, exhaustiveness-checked mapping (confidence 9)
- Guard lives inside the lock-held critical section — TOCTOU closed by construction in-process (confidence 9)
- Handler BAD_REQUEST mapping is defense-in-depth, consistent with existing pattern (confidence 8)
- Layered tests: wire-gate black-box (auth+permission+gate), module seam, sqlite repo with raw-DB row-count assertions, money-path invariant (invoice stays PAID, untouched) (confidence 9)
- Reserved `findAllocationsByPaymentId` (legitimate read surface) while removing dead `deletePayment` — restrained scope

## Residual risks (documented, not blockers)

- Cross-process TOCTOU closure relies on `BEGIN IMMEDIATE`/`transaction.immediate()` mechanism, pinned by the existing two-connection write-reservation test (mechanism-level, not a dedicated delete-interleaving stress test)
- DB-level `CHECK (amount > 0)` on `payment_allocation.amount` is an additional defense layer (noted in review)
- In-memory double diverges from sqlite at the module level under concurrency (documented in the adapter comment; test double only)
