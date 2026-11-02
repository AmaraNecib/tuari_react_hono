# #477 independent test audit

Source: 19284f46a78c8ab47a5cb803d2a3c135420c8e6b.
Tier: High-assurance. GPT-6 Luna high. Read-only, no rerun.

**HEAD `19284f46a78c8ab47a5cb803d2a3c135420c8e6b`: no remaining actionable coverage gap.** Read-only review; I did not rerun tests.

- **Concrete `optionId` validation:** `outbound-transfer-availability.test.ts` exercises the real `InventoryService` and SQLite repository. For consumables and assets, it rejects missing, foreign-source, and wrong-kind IDs, asserts `BUSINESS_RULE`, and verifies the write snapshot is unchanged. The selected-row cases also prove allocation does not silently fall back to another row.
- **Picker query states:** `multi-source-item-picker.test.tsx` independently sets pending and error for definitions and source contents. Each case asserts the matching status or alert, no empty-stock message, and no add button. The two query-state regressions are separately discriminated.
- **Specification and seams:** SQLite integration tests compare picker eligibility with write-gate acceptance for warehouse and project sources, and cover definition-versus-entry identity, asset selection, split balances, quantity conservation, and rollback. Rendered picker tests pin source arguments, archived-item filtering, and concrete-row IDs; the V2 mapper and contract tests pin forwarding those IDs separately from definition IDs.

The separately approved fractional-picker UX exclusion remains out of scope.
