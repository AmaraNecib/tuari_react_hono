# Issue #42 — Client-side bounds validation for invoice paid values

## Context

Base: `origin/develop` @ `842f6ea`; worktree on branch `fix/issue-42-paid-value-bounds`.

The invoice create page (`apps/web/src/features/inventory/inventory-invoice-create-page.tsx`,
"الدين والدفع" section inside a `CollapsibleSection` since #25) sends
`paidAmountDzd` / `paidPercent` to the API without client-side bounds
validation. Two defects:

1. Negative amount / percent > 100 can reach the API.
2. `void handleSubmit()` swallows a rejected promise on validation failure →
   unhandled rejection in dev/CI logs.

Server state (checked before touching anything):

- The wire contract already bounds the fields:
  `paidAmountDzd: z.number().nonnegative()` and `paidPercent: z.number().min(0).max(100)`
  in `packages/contracts/src/inventory.ts` (`inventoryInvoiceGroupCreateInputSchema`).
- The oRPC router implements the contract (`implement(appContract)` +
  `.input(inventoryInvoiceGroupCreateInputSchema)` in `inventory-contract.ts`), so
  the wire gate enforces those bounds server-side (BAD_REQUEST) before any handler
  runs — proven by existing wire-gate tests.
- The service additionally rejects overpayment (`paidAmountDzd > grossTotalDzd`,
  `inventory.service.ts`) — an upper bound on a total that only the server computes.

So the missing defense is the CLIENT-side check (mirror the contract: amount >= 0,
percent 0–100), plus an API test pinning the existing wire gate, and the
unhandled-rejection fix.

## Changes

### `apps/web/src/features/inventory/inventory-invoice-create-page.tsx`

- `validateForm`: add header-level debt checks (after the warehouse/project XOR
  check, before the lines loop). `createDebt && paymentInputType === "PERCENT"` →
  paid must be 0–100; `createDebt && paymentInputType === "AMOUNT"` → paid must
  be >= 0. Returns an inline Arabic message via a new `t(...)` key, blocking
  submit like every other field error. (No NaN guard: jsdom implements the
  number-input sanitization algorithm, so a non-numeric value collapses to ""
  = 0 before React sees it — the NaN branch would be unreachable, matching the
  existing checks that also skip it.)
- `handleSubmit`: on validation failure, `setFormError(...)` and return resolved
  (no `throw`) — the issue's "return a resolved false from validateForm" option.
- Save-button click handler: `handleSubmit().catch(...)` — validation errors are
  rendered via `formError`, mutation failures via the mutation hook's `onError`
  toast (`inventory-hooks.ts`), so a swallowed rejection must never reach
  dev/CI logs. Only usage of `handleSubmit` in the file (confirmed via grep).

### `apps/web/src/i18n/resources/ar.ts`

New keys under `inventory.invoiceCreate`, mirroring the existing
`invalidAssetPrice` style:
- `invalidPaidAmount: "المبلغ المدفوع يجب أن يكون صفرًا أو أكثر."`
- `invalidPaidPercent: "النسبة المدفوعة يجب أن تكون بين 0 و 100."`

### Attachment-upload failure (review follow-ups)

Round 2 (`816f093`): stopped the blanket catch from swallowing a rejected
`uploadInvoiceAttachments` — creation-mutation and upload failures each got
a visible toast and navigation was skipped.

Round 3 (Greptile PR #45 finding): keeping the user on the page
with the Save button enabled left a duplicate-invoice path — a second Save
click re-ran the creation mutation. The upload API (`POST
/api/inventory/invoice-groups/:invoiceGroupId/attachments`) attaches to an
already-created invoice id, so retry-by-id is possible without re-creating.
Chosen strategy (option 1):

- `createdInvoiceGroupId` state is set right after the creation mutation
  succeeds (only when files exist — with no files there is nothing to retry
  and the save flow completes immediately).
- While that state is non-null, the Save button is REPLACED by an
  "إعادة محاولة رفع المرفقات" (retry attachments) button that calls ONLY
  `uploadInvoiceAttachments(createdInvoiceGroupId, files)` — creation can
  never run twice from this page.
- Successful retry → `onCreated(createdInvoiceGroupId)` as in the happy path;
  failed retry → same toast, stays in retry state (`uploadingAttachments`
  disables the retry button while a request is in flight).

Failure behavior summary:
- validation failure → inline `formError`, resolved promise;
- creation-mutation rejection → the mutation's `onError` toast; no navigation;
- upload rejection → dedicated toast + retry state (no navigation);
- unexpected errors → the click-handler catch surfaces a generic toast instead
  of swallowing.

Tests: upload-failure shows retry action (Save gone); retry hits the upload
path with the SAME invoice id and the create mutation still ran exactly once;
retry-failure stays in retry state; mutation-failure never navigates.

### Unit tests (RTL/vitest, web)

`inventory-invoice-create-page.test.tsx`, in the debt-section describe:
- negative amount blocks submit (formError rendered, `mutateAsync` not called);
- percent > 100 blocks submit;
- percent < 0 blocks submit;
- boundary values still submit (`paidAmountDzd: 0`, `paidPercent: 100`);
- the blocked-submit tests double as the unhandled-rejection guard (vitest fails
  a run on an unhandled rejection, so a passing click-with-invalid-input test
  proves no rejection leaked).

### API unit test

`apps/api/src/rpc/router.test.ts` — wire-gate test calling
`inventoryInvoiceGroupsCreate` with `paidAmountDzd: -5`, `paidPercent: 150`,
`paidPercent: -1` → `BAD_REQUEST` with the field path in `data.issues`. The
server already enforces via the contract schema; this pins that defense
(no new production code on the API side — adding any would be redundant).

## Out of scope / decisions

- No server-side code change: the bounds already exist in the contract schema
  (wire gate) and the service (overpayment). Adding a duplicate service check
  would be dead code.
- No `<= total` client check: the contract does not bound amount by total —
  the overpayment rule depends on the server-computed `grossTotalDzd`.
- No Playwright this round (crew unit-only round).
- No unrelated refactors in the page.

## Gates

- `pnpm --filter @tuari/web test` (targeted + full)
- `pnpm --filter @tuari/api test`
- `pnpm typecheck && pnpm lint` (i18n-keys + unslop gates)

## Risks

- The empty `.catch()` hides genuinely unexpected errors from the console — but
  formError (validation) and the mutation `onError` toast (API errors) already
  surface everything user-visible; the catch exists to keep dev/CI logs clean.
- New Arabic keys must match the i18n-keys gate (they do: defined in ar.ts
  and each `t()` call also carries a fallback).