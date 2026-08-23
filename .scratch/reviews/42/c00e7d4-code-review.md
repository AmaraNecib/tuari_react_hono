# Code review — c00e7d4 (issue #42)

Lane-conducted review (parent owns the full review pipeline; this documents
the local Standards + Spec pass). Base `842f6ea`; mode: crew lane, unit-only
round (no Playwright).

## Standards axis

- **Style / structure**: additions mirror the existing `validateForm` idiom —
  same closure usage of `t()`, same early-return string shape as the
  warehouse/XOR and line-level checks. No new helper surface, no refactor.
- **Unhandled-rejection fix**: `handleSubmit` resolves on validation failure
  (no `throw`); the save button keeps `void handleSubmit().catch(...)` so the
  residual mutation-failure path (which `mutateAsync` still rejects even with
  `onError` set) cannot leak a rejection. Verified `handleSubmit` is the only
  usage of this pattern in the file (`grep`), so no sibling call site is
  affected. Other `void foo()` inline handlers in the app (security-section,
  settings-section, login-page) are out of scope for this issue.
- **i18n**: two new keys under `inventory.invoiceCreate` in ar.ts, named and
  phrased in the same style as `invalidAssetPrice`; every `t()` call also
  carries a fallback string, satisfying the i18n-keys gate.
- **Server side**: no production change made — the bounds already exist at the
  contract wire gate (`paidAmountDzd: nonnegative`, `paidPercent: min(0).max(100)`
  in `inventoryInvoiceGroupCreateInputSchema`, enforced by oRPC
  `implement(appContract)`) and in the service (`paidAmountDzd > grossTotalDzd`
  overpayment guard). Adding a duplicate service check would be dead code.
- **Gates (all pass on this HEAD)**: `pnpm typecheck` 4/4; `pnpm lint` 2/2
  (includes check:i18n-keys + check:unslop); `pnpm --filter @tuari/web test`
  603/603; `pnpm --filter @tuari/api test` 1255 pass + 1 pre-existing skip.

## Spec axis

Issue #42 acceptance points, each checked against the current code:

1. Paid value reaches API WITHOUT client bounds → fixed: `validateForm`
   rejects `createDebt && AMOUNT` with `Number(paidValue) < 0` and
   `createDebt && PERCENT` with `< 0 || > 100`, returning an Arabic inline
   error that blocks submission (payload never built; `mutateAsync` untouched).
2. Upper bound on amount: contract only requires `nonnegative` — matched,
   NO <= total client check (overpayment is a server rule on the computed
   `grossTotalDzd`; the service already rejects it with a field error).
3. Percent 0–100: matched to the contract exactly (min 0 / max 100).
4. `void handleSubmit()` unhandled rejection on validation failure → fixed
   both ways the issue suggested: validation path resolves (no throw), and
   the click handler `await handleSubmit`-style `.catch` swallows the
   remaining mutation path after the toast/formError have already surfaced it.
5. API defense-in-depth + unit test → the check already exists server-side;
   added `router.test.ts` wire-gate test pinning `paidAmountDzd: -5`,
   `paidPercent: 150`, `paidPercent: -1` → `BAD_REQUEST` with the exact
   field issue path, so a schema regression cannot silently pass.

## Round-3 delta (separate section)

## Round-3 delta (c00e7d4, Greptile PR #45 — duplicate-invoice path)

Greptile finding: after creation success + upload failure the page retained the
Save button and forgot the created invoice id; a second click re-ran the
creation mutation (duplicate invoice + duplicate financial entries). Valid.

Strategy chosen (option 1 — retry-by-id): the upload API
(`POST /api/inventory/invoice-groups/:invoiceGroupId/attachments`) attaches to
an already-created invoice id, so uploads are retryable without re-creating.
`createdInvoiceGroupId` is stored the moment creation succeeds (only when
files exist); while set, Save is replaced by a "retry attachments" action that
calls only `uploadInvoiceAttachments(createdInvoiceGroupId, files)`, so the
creation mutation cannot run twice from this page. Success (or a no-files
retry) completes with `onCreated(id)`; failed retry stays in retry state;
`uploadingAttachments` disables the retry button mid-flight.

Re-verified on c00e7d4: web 607/607, typecheck clean, lint clean (incl.
i18n-keys + unslop PASS).

## Review-fix delta (separate section)

## Review-fix delta (816f093, from hosted Greptile PR #45 review)

Greptile finding: the blanket `.catch` added for the unhandled-rejection fix
also swallowed a rejected `uploadInvoiceAttachments` — invoice created, then
attachments fail with no user-visible error. Valid.

Fix applied: every known failure path is now handled inside `handleSubmit` —
creation-mutation rejection is caught (its `onError` toast already fires) and
skips navigation; attachment-upload rejection shows a dedicated
`showErrorToast("تم حفظ الفاتورة لكن تعذر رفع ملفات المرفقات.")` and does
NOT navigate (no silent partial save); the click-handler catch is reduced to
unexpected errors only and surfaces them with `showErrorToast("تعذر حفظ الفاتورة.")`
instead of an empty swallow. The validation-failure `return` from the earlier
commit is unchanged and correct.

Re-verified on 816f093: web 605/605, typecheck clean, lint clean
(including i18n-keys + unslop).

## Findings

None actionable. One judgment call: the click handler's `.catch` is empty —
errors are surfaced via `formError` (validation) and the mutation hook's
`onError` toast (API errors), so nothing user-visible is hidden; a console
log would only add noise for a path that is already toast-handled.