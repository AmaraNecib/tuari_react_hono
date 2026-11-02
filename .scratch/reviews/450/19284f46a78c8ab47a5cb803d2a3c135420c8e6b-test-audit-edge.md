# #477 independent test audit

Source: 19284f46a78c8ab47a5cb803d2a3c135420c8e6b.
Tier: High-assurance. GPT-6 Luna high. Read-only, no rerun.

Final audit: **HEAD `19284f46a78c8ab47a5cb803d2a3c135420c8e6b` has one remaining test gap.**

**🟡 Minor — no test proves a valid concrete selector cannot fall back when its row is short.** In `apps/api/src/modules/inventory/outbound-transfer-availability.test.ts`, the selector tests cover missing, foreign-source, and wrong-kind IDs. They do not cover a *valid* consumable balance selector whose quantity is insufficient while a sibling balance for the same definition has enough stock. The service filters to the selected balance, then throws on the remaining quantity; add a regression asserting that error and a full before/after snapshot. This guards the concrete-row selection contract against future fallback changes.

The requested selector-rejection rollback cases are covered for both item types. Actual quantity allocation tests cover split balances, fractional and large-number remainders, shortages, and rollback at warehouse and project sources. I did not rerun tests.
