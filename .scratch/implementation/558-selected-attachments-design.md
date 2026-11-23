# Selected exact inventory attachments

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-0eec9839-aec6279289c6dd7b`.
Base: `721854cfe47f21a8e3a1a4a371d3a39317d4976e`.
Mode: `focused-local / CI-final-pending`. High assurance because the HTTP routes handle authenticated private files and persistent metadata. Local-only worker handoff. Parent owns independent reviews, publication and integration.

## Domain and interface

An inventory invoice group is the purchase group that owns inventory invoice attachments. It is not the separate invoice module's invoice record. Exact inventory preserves this identity and its attachment foreign key; only monetary columns changed.

The agreed test seam is the existing Hono upload/download endpoints with genuine BetterAuth owner and nonowner sessions. Purchase setup uses the selected exact inventory writer on the root-owned connection, not numeric table fixtures. Plain and keyed fresh files and actual attachment bytes live in new D-drive temporary directories.

## Decision

Expose only `addInvoiceAttachments` and `getAttachmentDownload` from the existing metadata/catalog inventory service through `inventoryAttachmentService` on the selected root. Keep the full numeric inventory service inaccessible. The Hono routes select the legacy service or this narrow interface only after authentication, owner checks and the upload license gate.

Add `invoiceGroupExists` to the inventory repository. Its SQLite adapter selects only the group ID. Attachment upload no longer loads legacy monetary columns to establish ownership. Existing attachment metadata methods, root-owned connection/FIFO, synchronous transaction handling and storage remain unchanged. There is no second financial graph or numeric compatibility projection.

The extra interface has depth because it shares limits, MIME policy, filesystem safety, cleanup and transactional metadata rather than duplicating them in the selected root. Deleting it would put those rules back into Hono or a second attachment implementation. The only new repository operation is a schema-independent existence lookup. No schema, writer, dependency, public contract, web or default activation changes.

## Validation order

Keep session and bootstrap-owner refusal at 401 before group/attachment existence disclosure. Upload remains license-gated; download remains readable during expired/grace status. Keep the global multipart body guard. Validate count, aggregate size, every MIME and every per-file size before any lazy bytes loader. Previously a valid first file could buffer before a later file failed validation. Preserve metadata transaction rollback and cleanup of files saved before metadata failure.

## Proof

The initial HTTP business test fails with expected 200, actual 503 for both plain and keyed files before production edits. The preflight regression fails because the first file's bytes loader ran before rejecting a later invalid file. Both are retained in ignored logs.

Focused green proof covers native uploads, persisted metadata and file bytes, download headers/body, download after close/reopen, anonymous/nonowner 401 on existing and missing resources, no unauthorized DB/filesystem changes, owner missing-resource 404, count and MIME refusal, grace/expired upload gates with downloads still available, and a native trigger-induced second metadata insert failure with complete rollback and filesystem cleanup. Existing attachment/storage and Hono tests retain per-file/total caps, traversal checks and global body limits. API typecheck and scoped ESLint run separately. No full suite or browser run.

## Wisdom

Applied the multipart pre-parse size-gate lesson and retained the upstream body limiter. Applied root-owned configuration and transaction lessons by reusing the existing storage instance, connection/FIFO and synchronous metadata transaction. No async transaction conversion or new transaction primitive was introduced. BetterAuth version deduplication advice is not applicable because dependencies are unchanged. No wisdom files were modified.

## Remaining gates

Parent runs the three initial review lenses and scoped architecture review at the committed head. Hosted acceptance and protection remain pending. No publication, browser/default activation or report namespace work is included.
