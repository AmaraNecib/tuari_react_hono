# Employee reference projections

Base: `2e21daa6388d6cf59dca4b3c72693efd70da8980` in `D:/worktrees/tuari_react_hono/t3-406a1c13-c959bb1ade8327e4`.

Scope: adapt the employee row, salary collection and state-history read projections to `salaryReference: { period, amount: string } | null`. The API contract and #522 remain unchanged. Keep amount strings exact, including four-place DAILY values and zero; null means no reference. State-history rows retain their own reference snapshot. Payment records remain separate read-only cash history.

Tier: high-assurance because salary data is money-adjacent. Verification mode: focused-local / CI-final-pending. No broader suite, build or browser run is planned.

The old projection copied `salaryAmountDzd` and `salaryPeriod` to employee rows, filtered salary-list entries by both legacy values, and formatted history from legacy numeric fields. This work replaces those projections without turning a reference into an earning, payment limit or monthly permission. No monthly remaining-pay or one-per-month ceiling exists in the three modules. The separate `employee-details-page.tsx` computes `proposedPaymentAmount` with `computeProposedSalaryAmount(employee.salaryAmountDzd, employee.salaryPeriod, parsedPaymentDays)`; that amount-default path and its `AddSalaryPaymentDialog` inputs need a separate component-integration lane. The deletion facts use salary-payment history only; they contain no earning relationship facts, so deletion behavior remains unchanged and does not account for earnings.

Interface handoff: employee rows expose `salaryReference`; salaried employee collection rows expose `salaryReference`; state-history work-history rows expose the historical `salaryReference` snapshot and render its exact amount string in `detail`. Existing UI consumers of `salaryAmountDzd` / `salaryPeriod` are outside this lane and need a separate integration change.

Architecture: no seam moved. Tests exercise the derived row and collection projections plus history snapshots. Wisdom applied: exact-money bound lesson (no numeric conversion or invented bound), salary refresh lesson (no form behavior changed), derived-view seam lesson (the public composition test reads through `buildHomeViewDerived`). No new wisdom candidate.
