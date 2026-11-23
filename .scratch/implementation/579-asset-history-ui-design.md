# Mounted exact asset charge history

## Authority and recovery

Worktree: `D:/worktrees/tuari_react_hono/t3-c16de1e5-11efc744e4c1e26f`.
Original base: `65c4755b96332ffad27612a589fdf1c838726c70`.
Dependencies, in order: invoice `381b7c1ec4cbe0f8e1d8a0d8f06acecdb89aeb63`, stock `80a516fd59ba7325985748771b2f5518b4bce732`, asset read `768ac0b2bfe970d9a108c1a6b5cb933675a9ce9d`.
Effective local base after picks: `d5990fa0aec7d6da9e1c456aa4c9083cbaa964d9`.
Mode: focused-local / CI-final-pending. High assurance because incorrect placement history can misrepresent exact project charges. Parent owns combined review, publication, integration and hosted acceptance. No children, writes to accounting, schema changes, push or PR.

The retired tree `D:/worktrees/tuari_react_hono/t3-10938f5a-56e9ade9d3d4f95c` was read only. Its binary HEAD diff was saved to ignored `recovered.patch` and applied here. `git ls-files --others --exclude-standard` returned no untracked files. Existing legacy history components were tracked, not missing untracked draft files. The recovered draft contained the exact history hook and inline rendering. It accessed expansion state before initialization, attempted missing translations and passed nullable revision money to MoneyValue. This change completes that draft rather than changing its accounting model.

## Domain and interfaces

An asset unit is not an item definition or invoice entry. A placement is one project charge with its own sequence, status and movement identity. A revision corrects that charge or records a void with a null new amount. Null is not a zero-money fallback. Warehouse/project source identities stay typed. Their original stock, movement and producer-option behavior is unchanged.

The existing `assetHistory({assetUnitId})` read is the only history request. The exact query key contains the client identity, authenticated owner and asset ID. The section still accepts warehouseId or projectId. It mounts one keyed read-only ExactAssetHistory only for the expanded concrete row. Collapsed assets request nothing. No project-charge fanout, defaults, numeric client, purchase-price reconstruction or additional writes.

The component owns loading, error, Retry, response identity validation and real empty states. It preserves the endpoint's newest-placement-first and ordered-revision arrays. It shows project context, placement sequence, LIVE/VOID labels, exact amounts, previous and new revision amounts, reasons, timestamps, charge/project/movement identities and available actor/transaction/void metadata. MoneyValue keeps strings exact; AppDate renders Algeria dates and clocks. The existing project correction/void editor is untouched.

Deleting the component would duplicate query states and exact audit rendering in the location section; deleting the hook would expose cache ownership details there. No shared module or accounting interface moved. Parent architecture review can stay at this component, hook, section and their mounted callers.

## UI decisions

The operator inspects a concrete asset while reconciling its placement charges in an existing dense RTL detail page. Retain its existing theme and disclosure rather than introduce a new dashboard or dialog. The control has aria-expanded/aria-controls and a 44px minimum height. Audit rows wrap on narrow screens; identifiers and amounts use bidi isolation. No animation or browser server was added. The only locale additions are real Arabic labels for placement and live status. Other history labels already exist and are checked explicitly in tests.

## Proof and boundaries

The new mounted success cases were run against the effective base's old section first. Both failed because Project Alpha was absent and the old unavailable state remained. Additional tests were added as regression coverage after implementation, not claimed as red-first. Tests mount ProjectDetailsPage and WarehouseDetailsPage with the real section, query hooks and history component. Only transport/session and outer router Link are replaced. This is mounted jsdom UI proof, not native integration, browser rendering, mobile visual evidence or hosted acceptance.

Focused scope includes stock, exact forms, exact equipment and legacy history-editor tests. The chain fixture is schema parsed and includes two projects, two placements, LIVE and VOID rows, ordered correction/void revisions, a wide exact amount and an Algeria midnight-boundary timestamp. Other cases cover pending, missing/read failure, retry, successful empty, mismatched response identity, cached A/B switching, lazy/collapsed requests, client/owner/asset separation, disclosure association and valid translations. Existing stock tests continue to protect source typing, exact transfer input, producer pricing and catalog freshness.

The canonical web typecheck and scoped ESLint are required. Own contracts output was built only as a test/type prerequisite through heavy_run after a frozen offline dependency restore. No package or lockfile changed. Logs stay ignored under `.scratch/reviews/579-asset-ui/`.

The whole-repository i18n checker fails at the effective base and final tree on the same pre-existing missing `detailPages.invoice.title` and five unused location/transfer keys. A temporary baseline probe restored the effective-base section and locale, excluded the new component, ran the checker and restored current bytes in finally. No unrelated locale cleanup is included. History translations themselves are present; this remains a disclosed repository acceptance failure for the parent, not a green checker claim.

Applied wisdom: schema-validated fixtures, query identity matching the mounted cache, loading/error distinct from empty, exact money instead of historical numeric locale formatting, typed location sources and producer-option preservation. The existing source already supplies AppDate's Algeria timezone boundary and exact MoneyValue. Historical full-suite and browser requirements do not override focused-local policy. No wisdom file is written by this worker. Candidate lesson: a recovered UI draft needs mounted proof; a hook alone cannot prove its disclosure path works.
