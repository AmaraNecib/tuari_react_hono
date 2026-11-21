# Exact inventory transfer history

- Base: `54935c29e13027088864796b897c2b67abb7ed91`
- Worktree: `D:/worktrees/tuari_react_hono/t3-bd181b74-9d2948ca4774efee`
- Mode: focused-local / CI-final-pending; high assurance for financial and stock history.
- Goal: replace the normal and location history consumers with a read on `financial.inventory.transferHistory`, without changing numeric routes or root composition.

## Domain and interface

History rows represent persisted inventory events. Purchases come from purchase movements and exact invoice entries; internal movement rows retain their movement identity; outbound rows come from exact outbound transfers, which carry SALE, RETURN, or GIFT identity and the exact source operands. Monetary values stay canonical decimal strings. A `priceSource` describes the stored valuation operands; it is never replaced by a fabricated unit price for agreed-total or derived-price sources. Payment state must come from the linked debt obligation and initial payment, not from inventory movement metadata.

The read interface accepts the existing date, location, type, and search filters plus bounded offset/limit pagination. Location history uses the same filtered read and requests more pages as the user expands the list. The query client is scoped to the authenticated exact financial inventory contract and keeps location/filter values in query keys.

## Seam and scope

The seam is `exactInventoryContract.transferHistory`, implemented by `ExactInventoryService` against current exact repository records and mounted by the existing exact inventory router. This gives the main history page and location-history component one typed read interface. The legacy numeric inventory route stays untouched. No schema, ledger, activation, or root composition changes are included.

## Verification boundary

Focused contract, service/router and web tests must cover purchase, internal transfer and outbound history; exact cents beyond JavaScript's safe integer range; filters and pagination; and loading/error rendering. Existing exact inventory regression cases and affected type/lint checks apply. Full-suite, build, browser, publication and CI acceptance remain parent/CI work.

## Applied lessons

- Read the matched exact money-bound and deterministic history-money lessons. History aggregates must use wide exact arithmetic; rendering must not coerce money to `number` or display a false zero while the query is pending or failed.
- Applied `domain-modeling`: distinguish a stored movement from the outbound transfer record and its payment obligation.
- Applied `codebase-design`: keep the new query behind the exact contract and service rather than mapping legacy numeric RPC records in React.
