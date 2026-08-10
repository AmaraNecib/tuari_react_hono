# #183 — Server-side search for cursor-paginated employee list

**Tier:** Standard (API + contracts + web UI + tests; no authz/financial/security surface).

**Base SHA:** `03ec349643901a2802338d8e19b730b28e5eb841` (origin/develop @ start).
**Branch:** `refactor/issue-183-search-filter`

## Problem

The employees section is limited to local (current-page) search because the
cursor-paginated `employeesListPaged` RPC does not accept a search term. The
frontend filters only the fetched page and shows `search.localPageHint`.

## Approach

Add an optional `search` term to the cursor-paginated employee list, applied
**before** pagination (so `total` reflects the whole filtered set), matching
`firstName`, `lastName`, and `phone` (case-insensitive substring). Wire the
employees section's `AdvancedSearchBar` query through to the RPC and remove the
local-filter fallback + `localPageHint` copy.

## Public API changes

### Contract — `packages/contracts/src/workforce.ts`
- `employeePagedListInputSchema`: add `search: z.string().trim().max(120).optional()`.
  (Empty/whitespace → trimmed to `""`/absent → unfiltered.)

### API types
- `EmployeeListFilters` (`modules/company/company.types.ts`): add `search?: string`.
- `EmployeeFilters` (`modules/workforce/employee.repository.ts`): add `search?: string`.

### Handler — `apps/api/src/rpc/handlers/workforce.ts`
- `employeesListPaged`: pass `search: opts.search` into the filters object.

### Repositories (both adapters; `**/adapters/**` excluded from coverage)
- `SqliteCompanyRepository.listEmployees` + `listEmployeesPaged`: when `search`
  present, add `OR` of `like(firstName, %term%)`, `like(lastName, %term%)`,
  `like(phone, %term%)` with `%`/`_`/`\` escaped (literal substring, matching
  the old `includes` semantics). SQLite `LIKE` is ASCII case-insensitive, which
  matches the frontend's previous `toLowerCase().includes()` behavior.
- `InMemoryWorkforceRepository.listEmployees` (feeds `listEmployeesPaged`):
  `firstName lastName`/`phone` `toLowerCase().includes()`.

### Web
- `useEmployeesPagedQuery`: new optional `search` param, added to the query key
  and the RPC call (cache-busting + refetch when the term changes).
- `employees-section.tsx`:
  - `pagedQuery` passes `search: query.trim() || undefined`.
  - While a search term is active, ignore the URL `cursor` (always page 1 of
    the filtered set — the employees list has no pagination UI today, and a
    stale URL cursor from a previous page would corrupt a new search).
  - Drop the local `rows.filter` and the `localPageHint` hint block.
- `apps/web/src/i18n/resources/ar.ts`: remove `search.localPageHint`
  (no `en.ts` exists — app is Arabic-only).

## Tests

| Layer | File | Coverage |
|---|---|---|
| Module unit | `employee.module.listpaged.test.ts` | search narrows items + total; search+status combine; empty search returns all |
| SQLite adapter | `sqlite-company.repository.test.ts` | paged + non-paged search, wildcard-char literal match, case-insensitive |
| Router | `router.test.ts` | `employeesListPaged({ search })` filters the seeded workers |
| Web | `workspace-queries.test.ts` | `search` in query key + queryFn payload |
| Web | `home-view.test.tsx` | typing in the employees search bar passes the term to the query and rows reflect it |
| E2E | `tests/e2e/employees-search.spec.ts` | seed employees directly into the E2E sqlite DB (UI/RPC creation blocked by the deferred role rule #227), search from the employees page, assert server-side match |

## Risks / notes

- **E2E seeding**: employee creation via RPC is blocked (legacy roles removed;
  tracked #227). The spec seeds rows straight into the E2E sqlite file
  (plain better-sqlite3, WAL, resolvable via `createRequire` into the pnpm
  virtual store) after `bootstrapOrSignIn`. This also doubles as regression
  coverage for the paged endpoint with real data.
- **LIKE wildcards**: escaped so a user typing `%` searches literally (matches
  old `includes` semantics).
- **Coverage**: all changed adapter files are under `**/adapters/**` (excluded);
  `company.types.ts`/`employee.repository.ts` are type-only. No new 100%
  branch obligations.
- **`listEmployees` (non-paged)** gains the same filter for type honesty (the
  shared `EmployeeListFilters` type drives both), but the wire schema for
  `employeesList` is untouched — only the cursor endpoint advertises `search`.
