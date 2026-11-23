# Issue 237: shared system log and enum filters

## Scope and baseline

- Mode: remote. Ticket source: https://github.com/AmaraNecib/tuari_react_hono/issues/237.
- Branch: chore/issue-237. Fixed base and initial HEAD: 17911dc14211730bec6982707f518b4c84dafa19.
- Local develop: 9fde24aa9718a9964e1aae1db8d9576224469e84. origin/develop was fetched during inspection. Compare the branch with the fresh target before integration.
- Tier: Standard. Standing global instructions retain debate, test-audit, and code-review until routine-review adoption is explicitly activated.

## Decision

Keep the card page and the existing shell table as separate presentations backed by useSystemLogQuery. Do not add navigation or replace the shell table. AuditLogPage currently has no production import or route, so introducing a route would expand this ticket.

Use the existing user-scoped query key and invalidation vocabulary. Filtered requests may have distinct keys within that vocabulary, as the shell already does. 'One cache entry' means no private systemLogList cache alongside the shared query for the same user and filters, not removal of filter-aware cache identity.

Pass domain, action, and date filters through the existing hook to the unchanged RPC. Retain text search locally. Domain and action option values must be contract enum values with translated labels. The existing create/update/delete action values also cannot match the contract and must be corrected in the same filter path. Reuse translated action/entity label helpers rather than duplicating label mappings.

## Interfaces and ownership

No RPC, schema, dependency, or mutation ownership change. The shared hook owns session gating, cache identity, and Algeria date boundaries. The audit page owns local search, pagination, and CSV export. The shell table keeps its existing behavior.

## Proposed verification seams

The owner explicitly authorized proceeding with the ticket without further permission on this turn. Tests use the rendered page and shared query boundary.

1. Render AuditLogPage with the real query provider and mocked RPC/session boundary. Verify enum filtering, date parameters, loading/error/empty states, and text search.
2. Mount a second observer of useSystemLogQuery with identical filters. Verify shared cache identity and refresh after the existing system-log invalidation operation. Verify user isolation.
3. Add Playwright coverage only if a reachable audit page is found. The current page is unrouted; do not fabricate an application route merely for a browser test. Existing transactions coverage can establish that the routed shell presentation remains unchanged.

Run the failing regression first, implement, then rerun focused tests. Required final checks are contracts build, typecheck, lint, and pnpm test through the heavy-work queue, followed by current-head local reviews and Greptile gates.

## Develop integration update

PR #605 initially received Greptile 5/5 on 7a8fc995, but GitHub reported conflicts with develop. Integrated origin/develop ea4a1ffa without rewriting branch history. Keep upstream AppDate rendering, Algeria export timezone and TableQueryState. The DatePicker now emits canonical yyyy-MM-dd, so pass dates directly to the shared query, without the earlier dd/MM/yyyy conversion. Preserve upstream date/time regression tests and move the shared-query regressions to a separate file. Adapt the upstream date test to await the server-filtered query and verify its inclusive end parameter.

Current verification policy after integration is focused-local / CI-final-pending until effective protection is checked. The former full local suite results belong to the pre-integration head, not the merged source. Focused audit and shell presentation tests passed 15/15. Initial typecheck found stale contract build artifacts; rebuild the existing contracts package before retrying. Full CI and a fresh hosted verdict are required on the new pushed head. Request one combined-delta local review rather than restarting the initial lenses. Owner UI approval remains required before merge.

## Risks

Filtered cache entries are expected and must remain scoped to the authenticated user. Export must retain the filtered selection. Avoid duplicating date comparisons that conflict with the hook's inclusive Algeria day boundaries. No migration is required.
