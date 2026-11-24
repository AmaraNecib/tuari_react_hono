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

## Operational inline correction on the verified dependency checkout

Continuation base c217ae744eff4c484e2ba11cd528c14e6ac9a18a. Sole writer tree is D:/worktrees/tuari_react_hono/t3-e9b4e5cb-6561e39471f10f1b, branch fix/325-verified-coverage. Parent supplied focused-local / CI-final-enforced with ruleset 26837184. That supplied enforcement state supersedes the historical pending note in this checkout's workflow; it is not a fresh protection inspection by this worker.

FailureCode owns only visible operational failure codes. Effects create and record numeric IDs after commit, never during rendering. A weak reference keyed by the originating error and attempt shares feedback across duplicate displays and StrictMode effect replay. Query errorUpdatedAt and mutation submittedAt distinguish retries even when a transport reuses an Error instance. No global query listener and no logging of raw errors or translated copy were added. Primitive rejections have component-local ownership; cross-component deduplication requires an object identity. The existing exact clients reject with Error objects.

Invoice query, command and split-preview failures, inventory query and command failures, movement charge-default failures, asset-history failures, location context failures and external summary failures now attach codes at their existing visible feedback owners. Form error inputs accept ReactNode to carry safe translated text and the shared code without replacing validation semantics. LoadErrorSurface accepts optional originating error and attempt; callers without them retain previous behavior. Removing FailureCode would duplicate effect timing, deduplication and numeric-only recording across these callers. No business calculation, mutation retry policy or persistence schema changed.

Exact attachment upload, refresh and native download failures now use translated fallback copy, not exception messages. Attachment validation retains actionable filename feedback without a code. The upload state machine still retries a failed refresh without uploading already committed files twice. The hook rethrows for existing control flow; only its visible file feedback records the failure, not the parent catch.

Red-first proof for FailureCode used an inert implementation: two behavioral failures, followed by green. Attachment regression covers invalid extensions, sensitive upload errors, duplicate feedback sharing and upload-versus-refresh ownership. Independent review remains parent-owned. Native execution at a8598d50 used the current source through Vite in the existing Tauri WebView, without a production or native build. A fault injected through the mounted purchase-list query fetch on /invoices displayed TUARI-DF230DAD; the unmocked native diagnostic event contained the matching numeric ID. This route mounts the inventory purchase page, so this is purchase-list feedback proof, not invoice-payment mutation proof. Arabic desktop/mobile screenshots are local under .scratch/reviews/325-inline-native-2. Matched baseline images, clips and owner UI signoff remain absent. The committed-head integration run exposed obsolete raw-message assertions and a missed support code on the purchase form's outer upload alert when Notes is collapsed. The bounded correction wires that actual feedback owner and asserts safe fallback text plus a code in both disclosure states. Failed runs remain retained.

The remaining table rows for workspace/recovery/home, expense and legacy inventory toasts, auth extraction, legacy attachments/reporting, settings/license/update and employee batch server catches are still open. This continuation does not claim those unrelated owners are fixed. A completed operational-inline correction is reviewable separately from completing the entire audit.

## Evidence and remaining gates

The first focused command, pnpm --filter @tuari/web exec vitest run src/lib/toast.test.tsx, exited 1 because vitest is not installed in this checkout. This is an environment failure, not red-first behavioral proof. D:/projects/tuari_react_hono also has no reusable node_modules. No install or build was attempted under the parent's disk-space constraint. Parent was asked for a reusable pinned dependency path. git diff --check passed after the initial correction.

Required before readiness: affected tests, lint/typecheck, committed-head checks and three separate review lenses. Required UI evidence remains matched before/after crops, full sidebar captures, clips and owner signoff. Actual native UI/log correlation remains unproven. This partial slice cannot close #325 or claim CI acceptance. Applied the reachability lesson by checking preflight returns precede mutation execution. Read the Playwright toast-response lesson; no browser success claims are made from mocked toasts. No wisdom files changed.


## Authorized continuation from 6828a4db

The parent authorized implementation in the sole-writer worktree
D:/worktrees/tuari_react_hono/t3-e9b4e5cb-6561e39471f10f1b.
Base 6828a4dbeec04f97feb1d061e0af282c0283b871. Verification mode remains
focused-local / CI-final-enforced as supplied by the parent. This is elevated
review scope because feedback crosses financial, authentication and recovery
callers. The parent arranges independent review and publication.

The remaining feedback owners now use caller-owned fallback copy for
operational exceptions. Explicit RPC field issues keep their existing form
contract. Auth permits only the existing known-message map and its current
translations, never arbitrary strings, nested messages or status text.
Account preflight has a distinct local error type. Phone schema failures and
employee batch field rejections are validation feedback, without incident
recording. Business operations, stock, debt direction and recovery sequencing
are unchanged.

The existing toast and FailureCode interfaces remain the feedback seams.
supportFailureMessage adds the same numeric logging contract to existing
string-state owners. It is called from event handlers only, returns safe
copy with a Unicode-isolated support code, and is not passed to showErrorToast.
This avoids recording the same incident twice. Update download progress and
the rejected invoke share one per-attempt message. Expected download
cancellation and absent browser license status remain non-failures.

| Remaining owner group | Implementation and focused proof |
| --- | --- |
| Workspace, recovery, shell and expenses | Safe operational toast copy. Account validation stays separate. Workspace regression asserts exactly one safe financial notification and zero operational notifications for account preflight. Recovery sequencing tests retained. |
| Auth and shared RPC | Known auth feedback survives; unknown exception text is suppressed. Field validation extraction remains explicit. Five changed expectations failed before correction; 42 extraction tests passed afterward. Shared table query alerts now include FailureCode. |
| Legacy inventory and employee batch | Inventory explicit wire issues use validation toast; operational exceptions use fallback copy. Upload failures retain saved-invoice retry ownership without exposing server text. Employee server field errors remain inline and use validation toast; unexpected failures use one operational toast. |
| Reporting and license | Report query and CSV preparation failures are safe and correlated. License status alert uses the existing LoadErrorSurface error interface. License activation/status string states record once per failed attempt, not on rerender. Unsuccessful activation envelopes reject safely. Four license ownership tests cover retries and browser non-failure. |
| Backup and update settings | Backup query, folder save and picker failures are correlated; raw historical backup reasons are no longer rendered. Blank-path validation and picker cancellation remain non-failures. Update check/download/apply failures have safe support hints; a regression proves one hint when progress and invoke report the same download failure. |

The deletion test still favors the shared correlation module: deleting it
would distribute numeric generation, formatting and best-effort recording
across the string-state owners. No new business seam or persistence contract
was introduced.

Focused proof covers the changed owners and direct RPC/table/debt callers.
The final affected run passed 240 tests in 21 files. An added test's inferred
throw-only return type caused a TypeScript static-side diagnostic; the
correction explicitly declares never and retains the same runtime behavior.
Exact commands, failures and current-head follow-up remain local under
.scratch/reviews/325-remaining/.

### Honest remaining evidence boundaries

Matched rendering is not complete. The attempted WebView/Vite component
capture failed at the capture setup. An earlier attempt captured the
up-to-date state rather than the injected failure and is invalid evidence
for this change. Its images must not be presented as failure-state proof.
Attempts and logs are retained. The WebView was restored to its original
production settings route and CSP bypass was disabled.

No claim is made for new native correlation execution, matched UI evidence
for every changed owner, mobile/sidebar captures, clips or owner appearance
approval. Earlier native numeric-lookup proof remains bounded to its
previous purchase-list scenario. These gaps and parent-owned independent
reviews block full issue readiness, not authorization to implement.
The selector expands to full E2E for an unmapped report test; full browser
acceptance remains CI-final rather than silently running a local full suite.

Wisdom applied: reachable preflight must precede mutation execution; a toast
alone does not prove an operation succeeded. No wisdom files were changed.
No dependency, native code, schema, prefix, auth protocol, recovery algorithm
or review policy changed. No push, PR or merge was performed.
