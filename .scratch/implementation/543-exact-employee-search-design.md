# Exact employee search and paging

- Base: `c6daf53dc0f2c643f69b67a5d4fde477695e9bc7`
- Worktree: `D:/worktrees/tuari_react_hono/t3-e1cb54f1-ba76d813cda48cee`
- Mode: focused-local / CI-final-pending
- Tier: high-assurance; employee reads and mutations must remain on the exact-data client and preserve existing write scope.
- Goal: restore the existing `AdvancedSearchBar` on the exact employee list and send search/cursor/limit to `ExactEmployeeClient.employeesListPaged`, so search applies before server pagination.

## Domain and interfaces

An employee list page is one server cursor window. Search is a case-insensitive server-side match over supported employee fields; it must not filter only the loaded page. `ExactEmployeeTable` remains the presentation seam and continues to use the exact employee client, exact salary reference renderer, record heading, and existing view/edit/delete callbacks. Pagination advances using the server-returned cursor; changing search resets cursor history.

No API or contract seam moves. The implementation uses the existing exact paged client and existing `AdvancedSearchBar`; no numeric salary or payment path is activated. Delete refusal continues to retain the row and surface an error.

## Scope and proof

Writable: `apps/web/src/features/employees/exact-employee-pages.tsx`, its matching test, and this design note. Focused proof covers the exact paged client arguments/cursor transition and existing exact-list empty state. E2E search expectations remain unchanged; no extended mobile verification is planned.

Excluded wisdom: `testing/employee-creation-via-ui-is-impossible-on-develop.md` covers employee creation RPC/E2E setup, not list search or pagination. No matching employee-search or pagination lesson was found in the wisdom index search. Architecture: no seam moved; the component now invokes an existing interface instead of bypassing it.
