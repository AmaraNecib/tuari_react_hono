# Issue #325 web/app failure audit

Base fa29d60368ba566227ebb47a83f6f5cf6983a5be. Worktree D:/worktrees/tuari_react_hono/t3-5809bfd4-0d14570235add5c7. Branch fix/325-web-correlation-5809. Parent supplied focused-local / CI-final-enforced, ruleset 26837184. High assurance because support diagnostics must not disclose operator data. Parent publishes; this worker never pushes or merges.

## Contract and ownership

An operational failure is an attempted operation that could not complete. A validation rejection is correctable input feedback before that operation. A correlation ID is a numeric u32 support hint, not an authentication token or unique incident key. The existing toast interface creates one ID, renders its prefixed form and sends only the numeric ID to record_ui_failure. The native logger is best effort. Browser-only sessions do not persist a native record. Adding a global query-cache logger would double-record already-owned mutation notifications and log background failures that have no visible failure state, so this audit does not add one.

The approved seams are operator-visible failure feedback, the shared toast interface, and the native numeric logging interface. showValidationToast adds input feedback without creating an operational event. Removing this module would spread code generation and logging across callers; keeping it central preserves locality. No persistence schema, prefix contract, viewer CLI, recovery algorithm or business operation changes.

## Confirmed correction in this slice

The previous showErrorToast implementation recorded local preflight rejections as failures. The new explicit validation interface retains the red dismissible toast but emits neither a support code nor a native logging command. Converted callers are outbound-transfer-create-page required source, counterparty, items, quantity and debt checks; outbound-transfer-create-page-v2 required counterparty/items; inventory-invoice-create-page attachment preflight; employee-batch-create-page local batch preflight. Post-operation catch paths remain operational. No classification based on message matching was introduced.

The toast regression asserts visible feedback, absence of a code, and no recordUiFailure call. Existing operational and success cases remain. Invoice tests distinguish rejected extension preflight from server upload failures. Employee precision validation asserts that no operational toast or mutation is emitted. Test mocks for direct affected callers include the new interface.

## Reachable gaps still open

| Owner paths under apps/web/src | Finding | Required next proof |
| --- | --- | --- |
| features/invoices/invoices-exact-page.tsx; features/inventory/inventory-exact-page.tsx, inventory-exact-movement-form.tsx, inventory-exact-asset-history.tsx, inventory-location-contents-section.tsx; features/externals/external-counterparties-route.tsx | Inline query/mutation alerts display generic failure copy without correlation codes. | Stable per-failure identity, no render-time logging, retry/new-failure transitions, shared errors rendered twice. |
| features/app-shell/workspace-mutations.ts, recovery-key-hooks.ts, home-view-shell-controller.ts; features/expenses/expenses-queries.ts, expenses-exact-queries.ts; features/inventory/inventory-hooks.ts | Operational toasts carry codes, but several callers pass Error.message or buildErrorMessage which permits raw fallback text. workspace-mutations also throws ordinary Error for account preflight. | Typed validation versus operational rejection; trusted translated business messages versus native/transport text; one feedback owner. |
| features/auth/login-page.tsx, use-phone-sign-in-mutation.ts; lib/auth-api.ts; lib/rpc-error-handling.ts | Error extraction permits raw strings; login uses inline error state, phone mutation uses correlated toast. Validation issue extraction intentionally preserves field messages. | Preserve actionable allowlisted auth/field feedback while suppressing unknown operational strings. Do not globally replace field validation. |
| features/inventory/inventory-exact-attachments.tsx, inventory-invoice-create-page.tsx; features/reports/report-builder.tsx | Attachment/report catches expose raw error messages. Exact attachments use inline local error state without codes. | Upload versus refresh failure ownership, sanitized download/report errors and actual native log lookup. |
| features/update/update-section.tsx; features/license/license-settings.tsx, use-license-activation.ts, use-license-status.ts; features/app-shell/backup-settings.tsx | Settings failures use inline state or raw exception strings outside the shared toast seam. | Enumerate each operation and cancellation path, keep expected cancellation non-failure, pin IDs per failed attempt. |
| features/employees/employee-batch-create-page.tsx and workspace-mutations.ts useCreateEmployeesBatchMutation | Local validation corrected; server AppMutationError and unexpected catch still use message text. | Verify hook/page ownership before changing it; never add another toast to a hook already owned by the page. |

This table records source-confirmed gaps, not completed fixes. It is not a claim that every dynamic failure has been exercised. Searches covered apps/web/src features, lib and components for catch, isError, role=alert, showErrorToast and Error.message; the native renderer, startup failures before React mounts, API internal failures with no operator feedback, and viewer CLI remain outside this slice. Silent background retries are not automatically operator-visible failures. ErrorBoundary and Diagnostics Settings already use numeric correlation; they still need native execution proof rather than an inferred pass from mocks.

## Evidence and remaining gates

The first focused command, pnpm --filter @tuari/web exec vitest run src/lib/toast.test.tsx, exited 1 because vitest is not installed in this checkout. This is an environment failure, not red-first behavioral proof. D:/projects/tuari_react_hono also has no reusable node_modules. No install or build was attempted under the parent's disk-space constraint. Parent was asked for a reusable pinned dependency path. git diff --check passed after the initial correction.

Required before readiness: affected tests, lint/typecheck, committed-head checks and three separate review lenses. Required UI evidence remains matched before/after crops, full sidebar captures, clips and owner signoff. Actual native UI/log correlation remains unproven. This partial slice cannot close #325 or claim CI acceptance. Applied the reachability lesson by checking preflight returns precede mutation execution. Read the Playwright toast-response lesson; no browser success claims are made from mocked toasts. No wisdom files changed.
