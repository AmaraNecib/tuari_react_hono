# #543 production project and warehouse pages

## Scope and risk

Worktree: `D:/worktrees/tuari_react_hono/t3-5bc05323-cd971f5895f52d32`. Base: `df08a808f59ab4cf7c1f39e560c25a8e56518d5d`. Mode: focused-local / CI-final-pending. High assurance applies because the normal root reaches exact salary cost and metadata/assignment APIs.

This slice replaces the reduced project and warehouse mini-forms in the capability-aware `WorkspaceShell` with existing production pages. It does not activate broader finance, inventory, invoices, dashboard metrics, or cash operations. No salary earnings implementation files changed.

## Interface and implementation

`HomeView` forwards project/warehouse IDs, detail tabs, and tab navigation into `WorkspaceShell`. `ExactProjectWarehousePages` uses `ApplicationClient` for reference lists, assignments, and manager ownership history. It reuses `ProjectsSection`, `WarehousesSection`, `ProjectCreatePage`, `ProjectEditPage`, `ProjectDetailsPage`, `WarehouseCreatePage`, `WarehouseEditPage`, and `WarehouseDetailsPage`.

The existing create/edit pages keep their top-level nonfinancial project/warehouse mutations. They invalidate the normal application query key before following the server-returned ID. Their legacy numeric inline-manager create affordance is disabled in this exact-capability route; manager selection remains available from real employee/role records. No numeric salary conversion was added.

The production detail pages hide inventory item/transfer tabs in capability mode and mount them only when selected in legacy mode. Project cost in capability mode calls only `workforceExact.getProjectSalaryCost` through a stable three-method client object. It does not mount the legacy aggregate. Assignment counts use distinct active employee IDs. Worker rows and manager histories come from the supported assignment/history list calls. Archive writes use the normal update operation and show its returned business error; no local constraint reason or unconditional success is invented.

The exact-mode shell now receives the route-derived section breadcrumbs rather than an empty list. A selected record name is not available to the shell breadcrumb builder without another read, so detail breadcrumbs stop at the linked project/warehouse section.

## Proof and limits

Focused tests render the normal `HomeView` and verify real project and warehouse detail pages, supported assignment/history calls, production list UI, and active project worker counts. Existing production create-page tests cover their full forms. Project cost remains unloaded on overview/detail tabs; the exact panel loads only when its cost tab is selected.

The standalone API may reject mutations with `UPGRADE_REQUIRED` when no Rust-verified `TUARI_LICENSE_STATUS` exists. The parent owns that runtime boundary. This slice does not inject a license status, bypass authorization, or claim browser mutation success.

No dashboard capability-awareness change is included because the parent owns that edit. CI-final remains pending. No browser/native/database run, publication, or merge was performed.

Applied wisdom: forward route IDs through the `HomeView` seam when details fetch their own data; never turn pending or failed assignment reads into a zero count. The project/warehouse pages reuse existing UI modules, so no architecture seam moved beyond normal-root composition.
