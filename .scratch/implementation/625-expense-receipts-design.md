# Expense supporting files

Base: d9510a7ec43986d825139b72d04ecf70253322d6.
Worktree: D:/worktrees/tuari_react_hono/t3-483fe3e4-0fd27700706ee760.
Branch: implement/625-expense-receipts-sol-483fe3e4.
Initial HEAD was 581cefacd2645fd8cd4059992d0489e9a6e6ff7b. The tree was clean and distinct from both manager reference trees. The pinned base resolved locally as a commit; git switch -c created the unused branch without fetching or resetting. HEAD and clean status were verified before edits.

## Approved scope

An expense has zero to ten supporting files. Each file is at most 5 MiB; cumulative bytes are at most 15 MiB. Supported MIME types are PDF, JPEG, PNG and WebP. Subsequent additions must respect these limits. Files have immutable identities and a persistent expense association. No financial, stock or expense revision changes are caused by attachment uploads.

Full backups include supported referenced files and their associations, not arbitrary files in storage. Retain legacy snapshot support and fail explicitly for missing referenced bytes. No database-only mode, file manager, cloud storage or receipt propagation to stock movements.

## Risk and verification

Elevated auth, schema and recovery risks require three independent initial review lenses, owned by the manager. Mode: focused-local / CI-final-enforced, under the supplied #616 owner acceptance record and ruleset 26837184. No hosted acceptance or protection recheck is claimed by this local-only worker.

Approved test seams are expense/file HTTP and persistence interfaces and the real worker snapshot plus standalone disposable restore. Focused tests cover unauthorized access, owner and expense isolation, cumulative limits, safe failure, old expenses, immutable bytes, unchanged financial history and mixed-owner restore. Laptop visual acceptance remains owner-pending.

## Current source trace

Inventory uploads persist inventory_invoice_attachment via AttachmentService and InventoryAttachmentStorage. Both production composition roots supply the configured attachment root. Snapshot worker copies referenced inventory paths and hashes. Restore is the manual procedure in docs/backups.md, not a runtime restore endpoint. Sales invoices have no persisted file attachment owner. The legacy outbound-transfer page has an unused file picker and a comment acknowledging upload is not implemented; no server upload or attachment table exists for transfers. Do not invent owners for those paths.

## Module design

Keep expense supporting files separate from monetary expense mutations. The receipt module owns cumulative validation and atomic association publication after immutable storage. Recheck aggregate limits inside the final synchronous transaction to reject concurrent additions without overfilling an expense. Clean staged paths on failure, never delete content-addressed shared objects. File reads require both expense and file identity. The snapshot worker reads the complete referenced-owner set from its consistent database copy.

Applied lessons: validate before lazy byte loading; retain the global multipart body cap; do not split cumulative check and insert across an await without a final transactional check. Existing adapters and schema attestation must remain consistent. Desktop startup and updater lessons are excluded because only the bridge path matcher changed, not process startup or updater code.

## Implemented interface

ExpenseAttachments exposes list, add and expense-scoped download. Its SQLite table is additive to both exact schema oracles, with older attested pre-receipt graphs upgraded without rewriting financial rows. The legacy root creates the same table. HTTP reads require expenses:read; uploads require expenses:update and a writable license. Existing global body limits and origin guards apply. The desktop bridge admits only the new expense attachment collection and individual-file paths.

The edit dialog loads saved files on each opening. Users first save a new expense, then reopen it to attach files. Uploads use a separate button and do not invoke expense edits or generate monetary revisions. The file input reuses inventory type limits; cumulative validation stays server-owned. No deletion or reassignment interface is exposed.

Snapshot inclusion adds expense_attachment alongside inventory_invoice_attachment. The standalone restore helper and local CLI refuse an existing destination, verify integrity and every referenced supported file, and reject missing bytes rather than report completion. Legacy snapshots with no referenced files may omit the attachment directory. A mixed-owner integration test removes the original snapshot and live storage after standalone restore, then reads expense files through their owning expense and verifies inventory bytes.

The module deletion test: removing ExpenseAttachments would move cumulative validation, transactional publication and cleanup into HTTP handlers. Keeping them together leaves transports responsible only for authorization and serialization. The restore verifier owns reference enumeration for restore, while worker inclusion remains inline because the existing worker intentionally cannot import TypeScript modules. That duplication is two short owner table lists; independent review should check that they remain aligned.

Remaining gates belong to the manager: independent debate, test-audit and code-review, scoped architecture review, laptop screenshot presentation and owner UI acceptance, and authorized hosted gates. Rust proof is scoped to the changed matcher extracted verbatim from lib.rs, with rustc tests and clippy-driver; no full Tauri build is claimed.

## Read-only history correction

The manager confirmed that existing voided rows cannot open the edit dialog. Add an independent attachment action to both flat and project-grouped expense history, for exact and legacy views. Its dialog passes readOnly to the attachment module and exposes only authorized reads/downloads and Close. It never calls an expense mutation and has no upload picker, save, relink, edit or void control. Existing server expenses:read authorization remains unchanged. No rights are granted by displaying the action.

The server also rejects attachment additions on non-LIVE expenses, both before byte loading and in the final publication recheck. A transaction finishing after an expense is voided cannot publish a new receipt. Existing associations and immutable bytes remain readable to authorized users.

Failing-first proof at 92a23bc3 caught the missing history action, missing read-only UI and accepted upload after void. One subsequent fixture failure came from a reduced snapshot-test schema missing the real expense status column; the fixture now includes status rather than weakening the guard. Focused tests cover flat legacy and grouped exact history. The laptop test uploads two files, voids, opens history, checks exact original receipt bytes, refuses anonymous download and post-void upload, and compares expense/revision/file/debt/stock-movement rows before and after reads and denials.

Develop synchronization was explicitly authorized for this correction. Fetched origin/develop at 82c7c8395c00a3ad288d82756c0f34277146338d and merged it without conflicts as 92a23bc3a4a6e438b6636442a70e838e6b190050. Only runtime-backup ignore policy and its regression test arrived. No manager reference tree was edited. Remaining independent-review, owner visual-acceptance and hosted gates are unchanged.
