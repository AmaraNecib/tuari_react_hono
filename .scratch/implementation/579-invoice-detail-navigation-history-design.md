# Exact purchase detail navigation and movement history

Base: 1a948adf0562b4eae6e827486756a561f4a629d8. Owned worktree: D:/worktrees/tuari_react_hono/t3-735a52ee-8d4b6d8a510efe19. Mode: focused-local / CI-final-pending. High-assurance bounded correction. Parent owns combined review, integration, eventual browser proof and hosted gates.

## Scope and authority

Owner explicitly approved a dedicated return-to-invoices action and visible movement history from the existing exact purchase detail response. Keep direct definition/minimum-one-line editor and Save reason. Initial payment method remains deferred to issue 591; asset percentage 559 is excluded. No purchase/debt form, API, contract, schema, storage, repository, accounting or calculation change.

## Interfaces and truth

ExactInventoryPage gains optional `onReturnToInvoices?(): void`. The selected-detail wrapper always renders the return action, including detail loading/error. It clears local selection and create intent before invoking the optional route callback. Inline list owners omit the callback and only clear selection. HomeView invoice-create/detail aliases wire it to existing `navigation.goToInvoices()`. Missing-ID detail uses the same dedicated label and existing typed inventory-invoice route target. No generic commercial invoice navigation is introduced.

PurchaseDetail still owns the authoritative keyed getInvoice query and attachments. A private read-only history renderer consumes that exact response and the existing typed location snapshot. No additional query or history fanout is needed. Movements are inventory movements linked by the service to entries of this purchase group, not another ledger or derived price table. Item/asset names are joined locally through inventoryEntryId and assetUnitId in detail.entries; an entry must also belong to detail.group.id. Missing names display real IDs, not guessed labels. Typed warehouse/project IDs remain distinct even when their string IDs collide. Missing location labels keep their typed IDs. Null endpoints are shown as unspecified, not invented external-party sources. Quantity is movement.quantity, never entry quantity, cached balance, zero fallback or computed valuation.

The region shows every available movement field: type, item type and available item/asset identity, authoritative quantity and entry unit, typed from/to locations, occurredAt, movement/entry/asset IDs, createdAt and optional note. It does not invent actor, counterparty, money or attachment metadata absent from this DTO. PURCHASE, TRANSFER and OUTBOUND_SALE have explicit Arabic labels. AppDate preserves existing date preferences and Algeria presentation. Semantic articles in an ordered list are read-only and stay in the page's RTL flow, with isolated quantities and IDs. Empty history is distinct from pending/failed detail. Existing item prices, loading/error retry, keyed identity and attachment editor remain intact.

Architecture: existing page/detail seam retained. The callback is necessary because direct routes own navigation while inline consumers own local selection. The private renderer moves no domain or write authority. Deleting it would return the history projection to PurchaseDetail, so it stays private rather than adding a shared adapter. No new domain term or global abstraction.

## Stable browser coordination

Button name: `العودة إلى الفواتير`. Region and h3: `سجل الحركات`. Markup: region > ol > li > article. Each article has an h4 for the actual matched item/asset name or real ID; PURCHASE text `شراء`; quantity `<bdi dir="ltr">×{movement.quantity}</bdi>`; typed destination such as `مستودع: Warehouse`. IDs remain visible for fixture-owned row matching. Parent and E2E author were sent this interface before final commit. Only the E2E lane owns the two browser specs; neither is edited or run here.

## Proof and limits

Mounted HomeView route tests use real QueryClient and schema-valid existing transport fixtures. Initial focused red baseline detects missing history and missing back action on unchanged production. Direct detail return lands on the purchase list with no create dialog; inline return clears selection without route navigation. Post-create return does not reopen initialCreate. Movement quantity 0.000003 is independent of an entry quantity of 100. Two cached groups retain their own item names and quantities. Type/date/source/destination/IDs/note, typed collision, missing labels and IDs, missing direct record ID, loading/error/retry and successful empty history are covered. Existing attachment upload retry/freeze, reconciliation-only retry and owner-isolation tests are retained.

Logs and temporary scripts remain on C; reuse installed read-only root/web dependencies and unchanged parent contracts dist. No installs, regeneration, builds, browser, server or fresh tree. Browser keyboard/screen-reader/visual acceptance, real persistence, current CI/hosted verdicts and protection remain parent gates. Exact local test results must not be described as browser acceptance.

Applied wisdom: direct IDs must reach the actual detail query, canonical session query identity, typed composite location identity, fresh DOM queries after navigation and explicit empty/error distinctions. Candidate lessons are reported in the commit body; no worker wisdom edits.
