# Purchase navigation and attachment review fixes

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-2c197dd2-f970b56477ee93f2`.
Base: `18b065b1345653166eec74ade50ba9c41b7333fc`.
Mode: focused-local / CI-final-pending. High-assurance because a purchase ID must not select a different financial aggregate and authenticated attachment metadata must survive reload.

Parent assigned hosted findings 7, 8 and 9, plus attachment thread `PRRT_kwDORksw9M66I-2p`. The supplied findings file was read. The supplied `review-update.md` path was absent; the attachment finding in the parent's brief is the available specification. The old Luna draft was inspected, not imported. Its one-time ref did not handle new IDs or direct fetches.

The parent subsequently authorized an additive exact detail attachments field and service/repository hydration. This retains the existing attachment schema, table, inventory group owner and download endpoint. No migration, storage writer, numeric projection or new owner type is introduced. Publication, independent combined-delta review and integration remain parent-owned.

## Domain and interface decisions

An inventory purchase belongs to `inventory_invoice_group`. A generic commercial invoice belongs to `invoice`. Unified search reads the former through `financial.inventory`. The existing invoice list/create/detail route aliases now mount the exact inventory screen and forward the group ID. Locations include both projects and warehouses; external parties retain their existing IDs. No search categories or results are removed. A missing detail ID produces a missing-record view.

Generic `ExactInvoicesPage` remains independently usable. Its route detail uses the existing `getInvoice` client independently of the first 100-row page. Each incoming ID is consumed once after a successful detail read. Back, Escape and outside dismissal cannot recreate that intent; a different ID opens its own record. Read failures have a retry action. Existing generic create intent remains intact.

The purchase form returns the created group identity through the mutation's existing result envelope. It waits for definitions before mounting an initial create draft. The attachment selection uses the existing limits validator and authenticated uploader. Once creation succeeds, upload failure freezes purchase fields and retries only upload against that group. A successful upload selects and fetches the exact detail. Detail uploads also refetch their list. The detail downloads use the existing desktop bridge or browser endpoint link.

`exactInventoryDetailSchema.attachments` is required and reuses `inventoryInvoiceAttachmentSchema`. Both exact repository adapters expose a group-scoped attachment read. Native reads project only attachment metadata from the existing table, including the existing download URL. The memory adapter reads explicit fixture references and does not claim native persistence.

The changed boundaries remain small: route composition chooses aggregate type; the exact query owns detail identity; the form owns the create/upload retry state; the service hydrates repository metadata. Deleting the attachment component removes upload/list/download UI without changing storage or ledger policy. No parallel attachment subsystem exists.

## Proof and boundaries

Focused UI tests cover purchase route identity, create/upload retry without duplicate creation, mounted detail upload/refetch, browser and desktop download controls, direct generic detail outside the first page, Back/Escape/outside closure and a subsequent ID. Existing exact forms, equipment and attachment-limit tests remain in scope. HomeView's route and search-corpus cases check composition without claiming real HTTP.

Selected native HTTP integration cases check actual upload, strict exact detail metadata, download bytes and persisted metadata after closing and reopening both plain and keyed databases. Existing auth/write/refusal assertions remain. A memory/schema case separately checks group filtering, required response shape and invalid metadata rejection.

Expected-red probes use the baseline implementation with new regressions, preserve failures and restore source immediately. Tooling failures remain separate from business reds. Dependencies are ignored junctions to the parent's installed packages. A local contracts build and ignored test/type configurations resolve this tree's generated contracts instead of the parent's output. No shared generated output was overwritten.

No full app build, full suite, browser agent, API/schema writer change or native UI claim is made. Browser E2E selection is recorded locally for parent integration; CI acceptance and protection remain pending.

## Applied lessons

- Detail IDs absent from the workspace snapshot must cross the HomeView route boundary explicitly.
- Dialog intent is not query data; consuming an ID must survive dismissal and cache refresh.
- Contracts dist must match source before adapter/router execution.
- Record metadata uses the existing response schema rather than a second hand-written public shape.

No wisdom files were written. Parent review must cover the additive required detail field and all direct callers, then carry valid prior conclusions for unchanged code.
