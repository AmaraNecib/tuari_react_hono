# Issue #595 catalog extraction

Base: 853e19342a04687233133b4b9f1148aaea1269c9. Worktree: D:/worktrees/tuari_react_hono/t3-2a8b2f54-9860074b25181337.

## Scope and risk

Move active definition behavior into CatalogService. A catalog definition describes an item; it is not a stock entry or a financial transaction. Preserve existing contracts and errors. Deeper review applies because authorization and the offer rule affect exact inventory callers. Verification mode is focused-local / CI-final-pending under docs/ci-final-activation.md. Publication and merge are not authorized.

## Ownership

CatalogService owns list, usage-scoped options, detail, creation, updates, text normalization and used-definition type protection. It accepts only the catalog repository methods and optional existing bootstrap-owner authorizer. The shared contracts offer rule remains the rule used by exact inventory writers. Removing this module would move validation and paging orchestration back into callers.

The selected root also needs attachments without constructing InventoryService. InventoryAttachmentService therefore owns the unchanged attachment implementation with a narrow repository dependency and storage. The legacy service delegates these two extracted capabilities for old callers. Shared mutation audit normalization preserves existing authorization and transaction-ID behavior. Financial schema, transaction ownership and retired route registrations are unchanged. No broader adapter extraction is needed; the existing SQLite repository satisfies both narrow interfaces.

## Proof

Exercise standalone catalog with a real SQLite repository, existing offer equivalence and referenced-entry protection, production Hono authenticated HTTP, selected-root RPC, attachment limits and selected mounted catalog/picker tests. Include relevant API typecheck and changed-file lint. No frontend source or visual styling changes. Browser selection is recorded locally; full suites/builds remain CI-final. Contracts compilation is an execution prerequisite, not an application build.

## Wisdom

Apply the ownership lesson about moving behavior rather than duplicating it and the composition-root dependency direction. Existing item-offer rule and repository remain shared rather than reimplemented. Architecture review is scoped to these extracted interfaces and direct callers.
