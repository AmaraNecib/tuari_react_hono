# Debt payment hardening for #488 and #482

## Scope and authority

One PR covers both issues. Base: ec0064c77c9ce381534c45327d04e1ebae35e712 on origin/develop. Worktree: D:/worktrees/tuari_react_hono/t3-e34dc141. Tier: High-assurance because a mislabeled movement changes money and debt direction. Mode: focused-local / CI-final-pending. Effective develop protection returned 404 on inspection. This blocks merge, not implementation or the requested publication.

The owner approved decimal DZD without rounding, Arabic-Indic digits, comma or Arabic thousands separators, and strictly grouped spaces such as 2 500.50. Malformed grouping is rejected. The owner also approved showing payment and projected balance before saving. Fractional precision is centimes, at most two digits, with excess precision rejected rather than rounded. Input text is not reformatted while typing.

## Domain and interfaces

A payment is a PAYMENT entry whose negative magnitude reduces the selected ledger's balance. PAYABLE and RECEIVABLE choose the account, not the payment sign. Existing credit can deepen, matching the existing cases-form contract. An adjustment remains a distinct manual correction and is not what a record-payment button posts. Settlement remains its own operation.

Test at the existing debt form submission interfaces and mutation hook/RPC boundary, plus the shared amount parser and payment-action resolver. The owner confirmed the input and preview behavior in conversation. Account lookup is shared; the selected ledger supplies the cases stat card when an account exists. Default to the sole existing direction, otherwise PAYABLE, without overriding a user's explicit choice.

A shared debt-payment module owns parsing, payment sign, payload type and projected balance. Removing it would duplicate rules in the cases form, ledger form and payment dialog. Debt utilities retain account lookup and labels. No server, schema, dependency or CI changes are intended.

## Proof and review

Use vertical failing-first regression slices, then affected web tests including debt utilities, debt UI, direct callers and workspace mutations. Test RPC rejection and the onError toast with the real mutation hook. Preserve existing payment, credit, pending and opening tests. Add relevant lint, typecheck and i18n checks. Run the existing E2E selector before choosing local browser coverage. The E2E selector returns full scope because the shared Arabic resource is critical. Keep full scope in CI. Locally select only tests/e2e/debt-entry.spec.ts because the uncertainty is the changed payment form's browser wiring, grouped-decimal preview and persistence. Capture element-sized invalid-grouping and valid-preview states. The signed movement formatter must retain centimes too, not just the balance formatter.

Commit the complete scope, then obtain distinct debate, test-audit and code-review sessions at the pinned head. Use the owner-approved same-family separate-session exception when no enabled non-author route is available. Review reports and verification logs stay ignored under .scratch/reviews/issues-488-482/.

## Hosted-review corrections

The first draft edit (amount, note or date) pins the cases form's currently displayed direction. Until an edit, defaults may follow asynchronously loaded accounts. After editing, a refetch that adds the opposite ledger must not retarget the draft. Explicit direction choices still take precedence.

A successful save clears only fields whose current raw values still equal the submitted values. Newer amount, note and cases-date edits survive older responses. This stays inside the existing form modules; no interface or payment resolver seam moved. Deferred-RPC tests cover ledger and cases forms, and rerender tests add PAYABLE after a RECEIVABLE draft begins.

## Applied lessons

Wire every new translation key in the same change. Default the ledger from the existing account but never overwrite a user's choice. Explain invalid or pending saves on screen. Preserve CRLF-aware diff checks and named-path staging.
