# Code review — `ad0ad988` (the stale-stock invalidation fix)

Scope: `git diff 21547e94..ad0ad988`. One production file plus its hook test.
Reviewer: the lane that wrote it (self-review), per the focused-follow-up brief.

## What the diff does

- Adds `invalidateStockDependentItemReads(queryClient, userId)` in
  `inventory-hooks.ts`: a one-call wrapper over
  `invalidateUserScopedQuery(..., workspaceQueryKeys.inventoryItems)`.
- Calls it from the four mutations that change where stock sits:
  `useCreateInventoryInvoiceGroupMutation` (receipt),
  `useTransferInventoryAssetMutation` (asset move),
  `useTransferInventoryConsumableMutation` (consumable move),
  `useCreateOutboundTransferMutation` (consumption).
- `useCreateOutboundTransferMutation` now resolves `userId` once instead of
  reading the session cache inline; no behavior change beyond the new call.
- Test file gains one `describe` with a shared sequence helper and four cases
  (one per mutation) that mount the options read and the mutation over the same
  real `QueryClient` with the app's 30s `staleTime`.

## Findings

### The prefix-wide invalidation is deliberately coarse — accepted

Invalidating `inventoryItems` also refreshes the unpaged catalog read and any
`.../detail/<id>` entries, and it refreshes options for every source, not only
the two the mutation touched. This is over-fetch, not incorrectness: the
options read is keyed under that prefix on purpose (the comment on
`useItemDefinitionOptionsQuery` says so), stock changes are operator-paced, and
the existing item-definition create mutation already invalidates the same
prefix. A source-surgical invalidation would need a predicate over the encoded
`itemUsageKey`, which would couple every mutation to the key's internal shape
for no user-visible gain. Leave as is.

### No new seam, no new state

The helper adds no module or interface; it names an invariant ("a stock change
refreshes every item read whose answer depends on stock") that would otherwise
be repeated at four call sites. Deletion test: removing it forces four identical
calls, so it earns its keep; but it is a wrapper, not a new abstraction.

### Test fidelity — the sequence is pinned, not the implementation

The test asserts observable behavior: read returns `[]`, mutation lands, read
returns the item, `options` fetched exactly twice. It seeds the session cache at
the key `getCachedSessionUserId` reads, so it exercises the primary
`inventoryItems(userId)` invalidation path rather than the null-userId
prefix-wide fallback (the #236 lesson in `.agents/wisdom/testing.md`). It does
not assert the helper's internals or a call count on `invalidateQueries`.

## Nothing found that blocks

No correctness, security, or accessibility concern in the diff. The only
judgement call (coarse invalidation) is recorded above as accepted.
