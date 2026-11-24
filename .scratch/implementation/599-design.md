# Attachment lifecycle extraction

## Scope and authority

Issue #599, base develop 3e79ae5b. Sole writer resumed the stopped manager's existing worktree at D:/worktrees/tuari_react_hono/t3-fd37376d-6a64aaf56a697117. Preserved the uncommitted extraction and earlier failed logs. Local-only authority, no publication or merge.

Verification mode is focused-local / CI-final-pending. Read-only protection inspection returned 404 Branch not protected. This is separate from local proof and blocks merge. The deeper three-session review route applies because authenticated persisted files and rollback are reachable contracts.

## Module and interfaces

AttachmentService owns upload validation, lazy byte loading, file cleanup after failed storage or metadata persistence, and download lookup. AttachmentRepository exposes invoice existence, transactions, attachment insertion and lookup. SqliteAttachmentRepository implements that focused interface without constructing numeric inventory workflows. The legacy InventoryAttachmentService import remains a compatibility alias. The selected exact composition root constructs the dedicated module directly.

Existing inventory names, transport paths, metadata types, storage adapter and error mapping remain unchanged. No UI or origin-policy changes. Deleting this module would move validation and cleanup complexity back into callers. Repository extraction removes the selected attachment path's reliance on the full inventory repository, while catalog continues using its existing repository independently.

## Proof

Agreed seams are the existing authenticated selected HTTP integration cases and the existing real browser invoice-link case. Reuse their independent byte, MIME, authorization, unsafe-origin, ownership, rollback and persistence assertions. Focused service tests exercise validation before loading bytes and cleanup on storage/database failures. Existing inventory service/storage tests protect compatibility.

Prior attempts failed on missing contracts artifacts and then an interrupted HTTP execution. Preserve those attempts; do not describe them as passing. After takeover the focused four-file run passed 28 tests, including both plaintext/keyed HTTP cases, in 9.86 seconds. API typecheck passed. The browser attachment-link case passed through normal composition with a real upload, invoice-detail reload and noreferrer popup navigation. No source edits were needed to restore those executions.

The selector reports full scope because the composition root is critical. Local browser proof is deliberately bounded to the directly affected persisted-file path; broader composition proof remains CI-final, not a routine local full browser run. Capacity measurement before the browser run showed 20.5 GB free RAM, zero CPU load and an empty heavy queue. The browser used heavy_run with one worker.

Applied wisdom: preserve lazy bytes until all metadata limits pass, as documented by the #214 allocation lesson. No new lesson proposed. Source remains frozen after commit for independent review and exact-head verification. Evidence stays local under .scratch/reviews/599; earlier logs remain at .scratch/599-*.log.
