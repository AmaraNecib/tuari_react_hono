# Hosted #637 source-privacy contract proposal

Status: owner-approved narrow implementation for PR637. The owner approved a restricted source representation for debt-only candidate/history reads and current UI handling. This approval does not authorize publication, merge, #615 work, grant changes or retirement of supported clients. The original proposal and expected-red probes are retained as preparation provenance; their pending-approval wording is historical and superseded.

## Current behavior and authority

`apps/api/src/modules/company/manual-settlement.service.ts` returns inventory identity through all three debt-read paths. `candidates()` returns `sourceKind`, `sourceId` and `sourceLabel` with each debt entry. `history()` and `accountHistory()` return nested `payableSource` and `receivableSource` descriptors containing `kind`, `id` and `label`. Purchase labels can disclose invoice numbers. SALE IDs and labels identify outbound records.

`packages/contracts/src/manual-settlement.ts` requires candidate source kind/ID/label and a nested descriptor `{ kind: "MANUAL" | "PURCHASE" | "SALE", id: entityId, label: string }`. `MANUAL` is a true provenance claim, not a hidden state. No approved restricted variant exists.

Debt reads authorize `debts:read`. `apps/api/src/rpc/rpc-middleware.ts` gates invoice/outbound inventory reads on bootstrap-owner status and returns `UNAUTHORIZED` to other employees. Source visibility must follow that same transactional inventory-read authority. Do not expand inventory grants, change settlement permission, hide debt/history records, or substitute `MANUAL`.

## Adopted wire representation

Preserve the candidate's existing flat fields for owners and add an explicit restricted variant for debt-only readers:

```ts
type CandidateSource =
  | { sourceKind: "MANUAL" | "PURCHASE" | "SALE"; sourceId: EntityId; sourceLabel: string }
  | { sourceKind: "RESTRICTED" };
```

The candidate's existing `id`, `debtAccountId`, `direction`, `postingSequence` and `remainingDzd` fields remain unchanged in both variants. For owner-visible MANUAL/PURCHASE/SALE sources, preserve the exact current shape and values. For inventory sources hidden from a debt-only reader, return only `{ sourceKind: "RESTRICTED" }`; omit `sourceId` and `sourceLabel` entirely.

History and account-history keep the current financial record shape and use this nested source union:

```ts
type SettlementSource =
  | { kind: "MANUAL" | "PURCHASE" | "SALE"; id: EntityId; label: string }
  | { kind: "RESTRICTED" };
```

For an authorized owner, both nested descriptors remain byte-shape compatible with current responses. For a debt-only reader, replace only a protected inventory source descriptor with `{ kind: "RESTRICTED" }`, with no ID, label, URL, invoice number, producer ID or other inventory identifier.

| Read path | Current required shape | Proposed owner response | Proposed debt-only response |
|---|---|---|---|
| `candidates` | `{ id, debtAccountId, direction, postingSequence, remainingDzd, sourceKind, sourceId, sourceLabel }` | Exact current shape and values | Preserve the first five financial fields; for protected inventory source use `{ sourceKind: "RESTRICTED" }`, with ID/label absent |
| `history` | Settlement record plus required nested `{ kind, id, label }` payable/receivable sources and reversal | Exact current source descriptors and financial record | Preserve settlement, original/settlement entry IDs, amounts, actor/date/note and reversal; replace only each protected descriptor with `{ kind: "RESTRICTED" }` |
| `accountHistory` | Same record and descriptors, scoped to one debt account | Exact current source descriptors and financial record | Same restricted source behavior; preserve the full account-scoped financial history |

A true MANUAL source retains its current descriptor and debt-entry ID/posting-sequence label. Only inventory-backed source identity is restricted. The schema shapes above are implemented under the owner's narrow approval.

## UI and client compatibility

Update contract schemas, inferred types, API projections and consumers together after approval. `apps/web/src/features/debts/manual-settlement-panel.tsx` uses candidate source fields for labels and links. `manual-settlement-summary.tsx` and `manual-settlement-link.tsx` render history descriptors. For `RESTRICTED`, show neutral text such as “Inventory source restricted” and no link. Do not show a manual-source fallback. Owner links stay as they are.

Compatibility evidence: `createFreshExactAppDependencies` exposes manual settlement only when `disposableManualSettlement` is true (`apps/api/src/app/fresh-exact-dependencies.ts`, option and capability construction). The normal/default root leaves it undefined. The connected test server opts in explicitly (`apps/api/tests/connected-exact-server.ts`); web routes require advertised `manualSettlement` metadata (`apps/web/src/features/externals/external-details-page.tsx`, `apps/web/src/features/shared/exact-financial-route.tsx`). The desktop bundles `../../web/dist` and `api-runtime` in one Tauri package (`apps/desktop/src-tauri/tauri.conf.json`), but browser runtime configuration accepts `VITE_API_URL` (`apps/web/src/lib/runtime-config.ts`), documented for browser preview in `apps/web/README.md`. A bundled desktop build does not establish lockstep for all web deployments. The repository identifies no separately released supported legacy client for this opt-in capability; arbitrary clients pointed at a server are not established as supported deployments. Where enabled, deploy the current server and web/desktop client together. Owner source shapes remain unchanged. Debt-only `RESTRICTED` is a deliberate wire change. No versioning or client retirement is introduced.

The employee keeps `debts:read` and existing settlement permissions. They continue to receive debt candidates and financial history. No debt/account/settlement/original-entry/settlement-entry IDs, amounts, actor/date/note or reversal data are hidden. Inventory endpoints remain owner-only and deny other employees with `UNAUTHORIZED`.

## Rejected alternatives

- Excluding inventory-backed candidates changes eligibility and hides legitimate obligations.
- Denying all debt history conceals financial records and changes permission policy.
- Calling a hidden source `MANUAL` falsifies provenance and triggers the wrong UI fallback.
- Removing labels but returning IDs still discloses inventory identity.
- Nullable fields allow incomplete source descriptors and still require client updates.
- A nested candidate-source migration changes every candidate consumer, including owner clients, for no privacy gain over the restricted flat-field union.

## Regression and rollout proof

Historical preparation used expected-red probes against the earlier runtime. Their logs remain donor provenance and are not current green evidence. The current authenticated integration file has three green probes covering candidates, history and both account-history directions; owner metadata and inventory-read denials remain positive controls. The dedicated owner browser case `#614` passed after the contract/UI change. These local results do not establish independent review, hosted acceptance, publication or merge readiness.

## Bounded review corrections

The initial three runtime review sessions found two issues. Restricted history with missing original-entry details still said "original manual entry" when expanded. The summary now uses the matching source descriptor to show neutral restricted text on both sides; a component regression opens the disclosure and rejects manual provenance. A separate positive control preserves the genuine manual fallback. This correction does not change source links, authorization, selection or financial records.

The authenticated candidate test now independently checks the original entry sequence and remaining amount for both obligations. Each direction's first obligation has sequence 1. After settling 10.00 against the fixture's 100.00 purchase and 30.00 sale, remaining amounts must be 90.00 and 20.00. These expectations are literals from the fixture scenario, not copied from owner or employee candidate responses.

## Decision boundary

The owner has approved the restricted candidate and history source unions and current UI handling. Inventory source visibility continues to follow the existing bootstrap-owner read authority; debt access, settlement permissions, eligibility and financial history are unchanged.
