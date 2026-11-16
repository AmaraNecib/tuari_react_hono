# Salary approval license feedback

Base `df87d2b30a46a12f48afb5511cafe6474db24d84`, PR #541, #543 earnings UI. Mode focused-local / CI-final-pending. High-assurance correction scoped to presenting a known refusal; no licensing policy, crypto, schema or approval protocol changes.

The parent used the normal integrated browser against a database snapshot. A real approval retry was refused by the normal API middleware with `UPGRADE_REQUIRED` because the standalone source API has no desktop-verified license status. The UI reduced every exception to the generic retry message, hiding the reason that the operation could not proceed. Repeated retry cannot fix a missing valid runtime license context.

The editor now recognizes only an actual oRPC `UPGRADE_REQUIRED` error and shows a fixed translated license explanation. It does not display arbitrary server diagnostics. Every other failure retains the existing generic copy. Drafts and durable ambiguous request IDs remain untouched; the same-request recovery protocol is not weakened or cleared on license errors. No active/trial environment is fabricated to get a passing browser mutation.

Regression was added before implementation. It failed because the generic alert did not contain the license explanation, then passed with the correction. Three focused salary files pass 27 tests; web typecheck and affected ESLint pass. Browser success and native acceptance are not inferred from this test. The desktop database was not written by this work.
