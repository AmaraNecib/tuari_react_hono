# Exact project-cost reader

## Scope and pin

- Worktree: `D:/worktrees/tuari_react_hono/t3-bdfed849-300d633c1eb13993`
- Base: `ba594e07a4c63151fbe372d85216d418d2ee020a`
- Goal: add an exact-schema project-cost adapter without changing the public `ProjectCost` contract or replacing the existing REAL-schema reader.
- Verification mode: `focused-local / CI-final-pending`.
- Tier: high assurance; reachable risks are exact money decoding, inventory source valuation, movement direction and shared-connection read consistency.

## Domain and interface

An approved earning segment remains the only labor-cost source. Cash, advances and paired noncash offsets do not contribute. A LIVE expense or asset charge contributes its stored exact amount. A consumable movement inherits the original inventory entry's `price_source`; for agreed and derived totals, the recorded source amount and original quantity remain authoritative. Movement quantities can split one source across several movements, and reversals negate the source line. Parked asset purchase values remain a separate informational total, not a project charge.

`SqliteExactProjectCostRepository` is a second adapter at the existing `ProjectCostRepository` seam. It requires the exact expense, inventory and workforce schema markers, receives the application's existing connection and FIFO lock, uses projection-local native integer reads for exact amounts, and provides one deferred read transaction around the service query. The existing adapter remains available for its current callers. Exact inventory `priceSource` stays internal to service aggregation and is not added to returned public rows.

The service now aggregates exact source lines before one history finalization. It reports finalized row values and exposes `unitPrice` only for unit-price sources. This avoids inventing a rounded unit rate for agreed or derived totals.

## Verification plan and status

The worker checkout lacked dependencies and returned its committed slice without executable proof. Parent integration in `D:/worktrees/tuari_react_hono/t3-48d661ef-3ae352d3d2c079c6` reused installed pinned dependencies. Initial parent execution caught a missing internal quantity type and a leaked internal priceSource field; both were corrected without weakening assertions.

Focused native plain/keyed adapter cases now use `ensureFreshExactApplicationSchema` and the actual shared financial graph. They compare a 10.00 agreed source split across quantities 1 and 2, then a quantity-1 reversal, against exact inventory contribution; verify separate 20.00 equipment charge and parked asset value; preserve 35,000 labor cost after 25,000 cash, 5,000 advance, 2,000 offset and 1,000 repayment; and pin a wide total of 90071992582536.70 after a large expense. The source-level service regression and existing expense handler/router cases also pass in the selected parent run: 23 cases across five files, with API typecheck and scoped lint clean. Independent reviews and normal-root integration remain pending. CI-final remains pending under the repository activation record.

## Design boundary

No composition-root integration, RPC/contracts, report or router changes are included. The parent owns normal startup integration and the independent debate, test-audit, code-review, architecture and publication gates.
