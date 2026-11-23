# Exact location stock and catalog freshness

## Scope and authority

- Tree: `D:/worktrees/tuari_react_hono/t3-b3c39d28-2ac6410bd0669a72`.
- Base: `18b065b1345653166eec74ade50ba9c41b7333fc`.
- Mode: `focused-local / CI-final-pending`. High-assurance because stock movement and exact valuation are reachable.
- Parent owns independent combined-delta review, integration and publication. No child delegates, pushes, PRs or merges.
- Authorized files are the location section, inventory hooks, independent tests and this note. No contract, router, service, writer, schema, translation or shared exact-query changes.

## Findings and interfaces

The mounted warehouse and project items tabs called a retired numeric location read. Keep both caller interfaces unchanged and move their shared section to the existing exact inventory client. The read identity includes location type and ID. A warehouse and project with ID `same` must never share stock or transfer source context.

Current stock means current asset placement and consumable balances. It is not the inventory REPORT purchase projection. No report reader or projection changes here. Catalog definitions describe available item identities; catalog creation must refresh the actual exact definition query family as well as legacy catalog and usage-option queries.

The approved test seams are mounted detail-page items tabs through their real location section and movement form, exact client reads and commands, and active queries over a real QueryClient. Only RPC transport and outer router links are replaced. The stock section and movement form are never replaced by test doubles. Fixtures are parsed through the exported schemas.

## Decisions

Reuse the existing exact location query, action hook and movement form. They already own stock option identity, quantity checks, transfer context, exact price sources, authenticated command dispatch and request identity. Do not create another movement implementation. The section adapts existing workspace location and counterparty reads into form context. Counterparties expose `fullName`, not `name`.

Render initial stock loading, read error with retry, and successful empty stock separately. Context reads also block actions on pending/error and expose retry rather than presenting a fake usable empty picker. Render purchase value through exact MoneyValue without Number conversion. Keep the form keyed by typed source so drafts cannot retain a previous source's identity. Reset mutation error state when opening a new movement.

The previous draft retained AssetChargeHistory, which uses retired numeric charge reads and writes. Do not mount that legacy action path in the migrated stock list. The retained user path is `/inventory`, stock section, project selector, project charge rows, correct or void action. The shell maps that route to ExactFinancialRoutePage, which mounts ExactInventoryPage. Its existing equipment tests exercise the actual exact action hook and charge dialogs. This is project-scoped editing, not equivalent asset-wide history.

The uncovered path is warehouse or project detail, items tab, asset row, Show charge history. That previously expanded the unit's placement chain and revisions, including corrections and voids. There is no exact asset-wide history endpoint in the current contract, only projectCharges and chargeDefault. Purchase value is not charge history. The parent rejected removal or deferral as completed parity. Preserve the existing Show/Hide history affordance with an explicit load-error state, never an empty history or numeric fallback. This is an unresolved integration gate, not feature parity. The parent will serialize any additive read after contract authority and invoice-lane coordination. No replacement endpoint or partial history claim is invented here.

Read investigation found that getInvoiceGroup exposes entries/assets, balances and movements, but no charge revisions. getProjectCharges filters repository charges by one project; the current project cannot recover prior placements and no all-project fanout is acceptable. chargeDefault exposes only the latest LIVE amount and source. The existing exact repository getCharge hydrates canonical exact money and ordered revisions. Minimal missing read shape is `{ assetUnitId } -> { assetUnitId, items: ExactInventoryCharge[] }`, ordered by placementSequence descending, including VOID rows and revisions. The narrow repository extension would select charge IDs by asset_unit_id and reuse getCharge hydration. Service asset-existence validation and a queryAuth router method would complete that seam. These shared files remain untouched.

Route legacy stock-dependent catalog refresh and catalog creation through one invalidation function. It reaches the exact client's definitions family, scoped by owner when available. Preserve the existing null-session fallback for active catalog queries. The legacy location hook remains unchanged because MultiSourceItemPicker still consumes its numeric interface. Its production mounting is not changed by this task. Repository search found no web caller of inventoryItemDefinitionsUpdate and no catalog editing UI; this patch does not invent an unused update mutation or claim update-flow proof.

## Depth and domain vocabulary

The section's interface remains warehouseId or projectId. Deleting its adaptation would duplicate exact context assembly and truthful query states in both detail pages. Movement and exact arithmetic complexity stays behind the existing form and action interfaces. No ledger or domain contract changed. Stock option identity remains the balance/asset row, distinct from item definition and receipt entry identity. Parent architecture review is limited to these changed seams and direct callers.

## Evidence and chronology

The previous worker's two-file draft existed before this lane. This lane first wrote independent tests and ran them against the untouched base. Four business reds were observed: both location scopes failed to load Cement, pending stock lacked a status, and active exact definitions stayed empty after creation. The other 23 selected tests passed. Raw output is `.scratch/reviews/579-location/red-real.log`. Import of only the two authorized draft files followed that run. The initial missing vitest path and later import typo are environment/edit failures, not business reds.

Additional asset command, exact outbound source-ratio, missing session cache, and actual mounted detail-page checks were added after the first green. Their chronology is green regression coverage, not claimed red-first evidence. Final focused scope includes the new stock tests plus existing inventory hooks, exact forms, equipment, catalog page and multi-source picker cases. Commands, durations, native exits and final fingerprints are recorded in the ignored verification handoff.

The parent dependency directory is reused through ignored junctions. An initial shared contracts dist was stale relative to the pinned source. This lane built its own contracts output with the heavy queue and pointed only its own web dependency link at that output. No shared generated output or dependency manifest changed. No new package was fetched.

Applied wisdom: active cache integration without document reload; session cache at the real sessionQueryKey; schema-valid fixtures; one refresh seam without deleting granular legacy hooks; loading/error are not zero or empty. Historical full-E2E advice is superseded by the current focused-local workflow. Exact money uses MoneyValue, not historical numeric locale formatting. No new wisdom file is written by this worker.
