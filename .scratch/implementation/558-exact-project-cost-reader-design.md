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

Expected focused proof: project-cost service unit tests, exact-schema adapter tests built with `freshExactSchemaPlan` / `ensureFreshExactApplicationSchema`, existing legacy project-cost integration tests, and scoped API lint/typecheck. The source-level unit regression covers a 10.00 agreed source over quantity 3 split into movement quantities 1 and 2, then a quantity-1 reversal. The full native adapter and contribution-comparison scenarios still need to be added before this scope is ready for review.

Local proof is currently blocked because this checkout has no `node_modules`: `pnpm --filter @tuari/contracts build` exited 1 (`tsup` not found; pnpm reported missing node_modules). No dependency installation was run. CI-final remains pending under the repository activation record.

## Design boundary

No composition-root integration, RPC/contracts, report or router changes are included. The parent owns normal startup integration and the independent debate, test-audit, code-review, architecture and publication gates.
