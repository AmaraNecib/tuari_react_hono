# Code-review evidence — issue #289 (payment validation)

**Tier:** High-assurance
**Base:** `bb144f3` **Head:** `1fc8859`
**Run:** parallel Standards + Spec `reviewer` sub-agents on `git diff bb144f3...HEAD`.

## Standards axis

- **No hard violations.** Conforms to documented patterns:
  - Service-boundary defense-in-depth reuses shared contract schemas (`paymentAmountSchema`/`paymentListLimitSchema` safeParse at the seam) — architecture.md pattern, #226 precedent.
  - Transaction discipline via the shared FIFO lock + `transaction.immediate()` — no new hand-rolled lock (#288 drift risk avoided), BEGIN IMMEDIATE mirrors `runInTransaction`.
  - `PaymentDeleteResult` discriminated union mirrors the "port results mirror wire output" principle; all branches consumed.
  - Output schemas validate (`.positive()`/`.int()`/`.max()`), never transform.
  - No silent behavior changes — every tightening documented + pinned.
- **Judgement calls (no action):** duplicated guard logic between adapters (deliberate defense-in-depth + adapter parity, honest divergence comment); growing `instanceof` error-mapper chain (matches pre-existing audit-mapper pattern).

## Spec axis

- **All done-when items implemented and pinned:** create rejects empty allocations + non-positive amounts; listPaged validates limit; delete atomic/guarded; unit tests at the module seam (module, sqlite module, repo, RPC black-box, contracts).
- **Documented scope additions (defensible, not creep):** `.max(MAX_SAFE_INTEGER)` on amounts (test-audit `2**53` finding; also tightens output schemas — client-visible but unrealistic for currency); `.int()` on limit (wire-reachable sqlite 500); `deletePayment` port removal (in-scope for atomic delete).
- **Nothing implemented-but-wrong found.**

## Residual risks (documented, no action)

- No test simulates the concurrent create-during-delete interleaving under lock contention — only the guard semantics are pinned (deterministic interleaving control would require test hooks into the lock; the serialization mechanism itself is tested).
- MAX_SAFE_INTEGER cap is a client-visible contract tightening (unrealistic for DZD currency amounts).

## Verdict

No actionable findings on either axis → ✅ safe to push.

---

## Post-evidence delta (1fc8859 → 6ea1f22)

Head moved by a single docs-only commit (`6ea1f22`): two wisdom entries appended
to `.agents/wisdom/` (architecture.md + testing.md) — no code, contracts, or
tests changed. Evidence re-pointed to the final head per the guard's
staleness check (.agents/ is reviewable). The code reviewed at `1fc8859` is
byte-identical.
