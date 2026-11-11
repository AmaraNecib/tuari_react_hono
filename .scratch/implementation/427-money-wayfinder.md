# Wayfinder map: exact money across the application before v1

Draft for owner approval. Intended canonical home is a GitHub issue labelled `wayfinder:map` in AmaraNecib/tuari_react_hono. No issues have been created by this draft.

## Destination

An owner-approved, implementable route to exact currency-neutral monetary representation across every financial table and connected input, calculation, API, display and recovery path before v1 release. Salary v1 is the originating use case, not the boundary of the application-wide work.

## Notes

Origin: [Salary v1: approved earnings, flexible project allocations, payments and opening balances](https://github.com/AmaraNecib/tuari_react_hono/issues/427). Do not close, rewrite, replace or reparent that issue. Money representation supports its existing approved behavior, rather than replacing its acceptance criteria. The spec and implementation tickets will reference this origin by title.

Planning only. Decision tickets are native sub-issues of this map. Execution tickets belong to the separate application-wide money specification issue. Do not label ordinary implementation work as Wayfinder decision tasks. Publish only after the owner approves test seams, ticket granularity and blocking edges. On publication, create issues first, then wire native blocked-by relationships using database issue IDs. Use existing GitHub labels; no tracker-configuration or AGENTS edits are needed for this effort.

Use wayfinder for one decision ticket per session, domain-modeling and grilling for human decisions, research for runtime feasibility, then to-spec and to-tickets for the execution plan. Code work later follows feature-implement, tdd and guard with high-assurance review and the repository's current focused-local/CI-final mode. Native decision dependencies must be closed before an implementation ticket becomes takeable; owner-only decisions cannot be silently answered by an agent. Claim a decision before resolving it. This charting session resolves none.

The owner requires all monetary tables to use the new representation before v1. Quantities, days and percentages are not money. Currency-neutral design does not require multiple enabled currencies or exchange rates. There are no real/customer records; this is not approval to delete dev data or databases. No code/schema/writer activation is authorized by charting.

Starting inventory: 17 existing monetary tables, 27 money/rate columns. The spec owns its table coverage and release acceptance. The first two decision tickets own the outstanding answers, not this index. Existing encrypted-driver issues are external constraints, not work to duplicate or take over.

## Decisions so far

None resolved through this map. Prior owner requirements appear in the spec as source requirements, not as invented closed decision tickets.

## Not yet specified

Unexpected extra monetary storage or dynamically generated financial payloads found by the final exhaustive writer/read-path check may require additional conversion tickets. The exact inventory split can grow after the feasibility decision establishes the runtime and repository boundary. Only genuinely unformulated discoveries belong here; known runtime, schema, currency, price rounding and rollout questions already have draft decision tickets.

## Out of scope

FX, cross-currency settlement, selectable operating currency, payroll tax, attendance systems, automatic wage penalties, inferred historical earnings, customer-data adoption machinery for nonexistent customers, database reset/drop, dependency upgrades without vetting, taking over encryption repair or unrelated issue backlogs.
