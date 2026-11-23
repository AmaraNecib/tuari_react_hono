# Issue 443: truthful table query states

## Scope and authority

Own worktree `D:/worktrees/tuari_react_hono/fix-v1-issue-443`, branch `fix/v1-issue-443`, target `develop`. Initial base was `043b928d01966ef085e8ca59846d5b8a59fbf7d3`. Safely fast-forwarded to `fa0788548ad2a7c2d88791820d3bf4033142e844` after peer PR510 merged, preserving its asset-charge E2E work. Merged peer PR511 at `149e1183c80ea15a71983c5d4c690eaa08669d98` without rewriting history. The audit list conflict keeps the shared query wrapper and the peer's explicit Algeria timezone in its date display. The owner authorized implementation, publication, UI self-acceptance and merge after all gates pass.

Verification mode is focused-local / CI-final-enforced. Live ruleset 26837184 is active on develop, requires strict CI acceptance from app 15368, forbids deletion and non-fast-forward, and has no bypass actors. Historical activation docs remain unchanged.

Standard review tier. Reachable risk is presenting a pending or failed read as a successful empty result. No money, stock, permission, date or mutation rules change. All three independent initial review sessions remain required.

## Design

A shared `TableQueryState` in `features/shared/table-primitives.tsx` owns loading, failed-read, retry and retained-data behavior. Callers pass their existing query object and a localized resource name. Existing successful content, empty-state guidance, filters, typography, radii, RTL and pagination remain unchanged. This wraps list content rather than rewriting tables or adding query knowledge to presentational table rows.

Pending with no data renders an announced loading message. Failure with no data renders an alert naming the resource, the available reason and a retry button. Cached successful data stays visible during refresh; a failed refresh adds an alert and explicitly identifies retained data as not refreshed. Retrying disables the retry button and announces progress. An empty-state child only renders after successful data, never as a substitute for missing data.

Query-backed consumers include the catalog, invoices, employee search, transfer lists and location transfer history. Audit and system log already distinguish states but need shared actionable retry. Expenses already guards loading/error and will reuse the shared behavior. Projects, warehouses, debts, externals and salary tables receive the composite workspace snapshot, whose initial load/error is already guarded in HomeView; preserve that guard and expose refresh failures there rather than re-querying each table. Asset charge history already has separate query states and belongs to peer #426; do not edit it.

## Vocabulary and interfaces

A genuinely empty result is a completed successful read containing no matching rows. Pending is not empty. Retained data is the last successful result, not evidence that the latest refresh succeeded. These are query display terms, not new business concepts, so no domain glossary change is needed.

The wrapper is the shared seam. Removing it would duplicate query-state selection and retry copy across consumers. Existing Table and AppShell table layout interfaces do not change.

Hosted review found that wrapping the whole system-log page unmounted its server-side filters whenever their query key changed. Keep that page and its filters mounted; pass the existing query state through page-content props and wrap only the system-log results and pagination. The composite workspace wrapper still handles workspace refresh failures. A HomeView regression asserts the same input node stays connected and focused across pending/error states, supports retry and clears a failed filter. A real RPC browser case types several characters during a held read, then clears the failed filter to recover. Selector registration is part of the new browser test's required wiring, not a CI policy change.

## Proof

The issue explicitly requests shared and consumer state tests. Test the shared exported component and the real InventoryItemDefinitionsPage through rendered roles, content and retry interactions. Include pending, error reason/retry, successful empty/populated and retained-data refresh paths. Run affected consumer tests, ESLint, web typecheck and i18n checks. A new catalog browser integration case holds a real RPC, returns a synthetic 503, retries with Enter and creates a synthetic item after recovery. Register the route before bootstrap because dashboard summaries may prefetch the catalog; otherwise a cached success can bypass the intended initial-loading assertion. The selector chooses full scope because ar.ts is critical. Local browser scope stays on this changed behavior and its real API path; full browser scope, full suites and production builds remain CI-final.

Use real pinned before/after rendering with synthetic data, cropped element PNGs and a complete interaction recording. Inspect all media. Browser work uses heavy_run. Media is public only after checking that it contains no real data or auth state.

Applied wisdom: shared owns table behavior, not app-shell; do not project missing query data as false zero/empty; keep retained results during background errors. The installed impeccable skill references an absent product.md register. Its existing source conventions and harden.md guide this scoped fix without installing or changing skills.
