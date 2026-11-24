# Issue 614: purchase and sale settlement

## Scope and authority

Base: `d9510a7ec43986d825139b72d04ecf70253322d6` in the worker-owned worktree `D:/worktrees/tuari_react_hono/t3-b9be96b2-a74e82b0d9fa71b8`.

Implement settlement for purchase records and outbound SALE records only. Support warehouse and project origins, plus supported manual originals. Keep #613 opt-in; this work does not activate it. Exclude returns, gifts, default activation, #615, publication, issue closure and merge.

## Domain invariants

Settlement records payment of an existing source transaction. It must preserve that transaction's cash, stock, locations, prices and project costs. Reversal must restore the pre-settlement state atomically. Source reads, navigation, cancellation and payment behavior must remain valid. Reject unsupported source kinds rather than silently mapping them to purchase or sale.

## Interface and proof plan

Follow the existing #613 manual-settlement contract and service interfaces where applicable. Add source-specific adapters or operations only where those interfaces cannot represent purchase and outbound sale without weakening their existing invariants. Verify through authenticated native integration paths and browser interactions if UI changes are needed.

Write failing tests first for eligibility, source-kind boundaries, atomic settlement and reversal, and preserved source values. Add focused adapter and connected-client tests at the existing finance/write seams. Do not infer proof from mocked services alone.

## Review and verification

Risk tier: elevated, because settlement changes money and inventory writes. Verification mode: `focused-local / CI-final-pending`. Run the three initial review lenses in order: debate, test-audit, code-review. Then run Guard Phase 2 against the exact committed head. Do not publish or claim hosted acceptance.
