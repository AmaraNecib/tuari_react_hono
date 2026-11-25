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

## Hosted findings correction at 9054c6d4

All six inline findings on #629 were read in full and checked against source. No thread resolution or review request is authorized in this writer lane.

The opening fixture filtered opening statements out of the current plan, accidentally combining receipts with a pre-opening graph. The accepted #558 plan at 517066a2 and all seven schema inputs were compared with retained freshExactSchemaPlanV1. Those DDL inputs are unchanged. The fixture now uses V1 directly; both plain and keyed historical upgrades retain financial rows and prior application markers. The prior receipt-without-opening hybrid is a negative case and remains rejected byte-for-byte. No arbitrary schema is accepted to make the fixture green.

Expense upload requests use the existing request-window primitive, keyed only by the resolved authenticated user ID. The limit is ten requests per minute, not ten files. Authorization, permissions and writable-license checks precede the limiter. Hono's global bodyLimit eagerly buffers no-content-length bodies, so the exact expense POST route defers that same size guard until after the limiter. Other routes retain the global guard. Tests spy on the original stream reader and multipart parser to prove no body consumption for denied or rate-rejected calls, then exercise independent principals, ignored forwarded identity, normal two-file batches, GETs and clock-controlled window expiry without load scripts.

Standalone restore now requires byte_size to be a valid nonnegative integer and to match the restored bytes, independently of digest availability. Real disposable restore cases cover intact, empty and truncated legacy invoice files, both with absent sha256 columns and null digests. Old snapshots without referenced files remain supported.

History-only project groups are derived from listed rows in both legacy and exact consumers. Missing groups receive zero total/count; financial totals and mutation authorization are unchanged. The legacy consumer test uses an all-voided project with an empty live aggregate list, then opens its read-only files.

Receipt queries explicitly refetch on mount. The reopened query test retains one QueryClient with a 30-second stale time, adds a file outside that cache between openings and requires the externally added link on the second opening.

Receipt list, upload validation and scoped download currently query expense_id and order by created_at,id. Add expense_attachment_owner_order_idx on those columns. Keep the original receipt DDL and pre-index plan intact as a named historical graph. Fresh exact and disposable settlement startup attest the complete old graph and markers before adding only the index, then reattest the new graph in the same transaction. Wrongly defined indexes remain rejected rather than repaired. Legacy composition creates the same index. SQLite index_info and EXPLAIN QUERY PLAN prove column order and indexed ordered lookup; root-level tests cover the legacy and settlement paths. No full-suite, dependency or policy changes are part of this correction.

## PR #629 restore coverage correction

Base: ffcf38a5d10be536f657af4dac0ed32f6f4e2603. A targeted disposable-restore regression now uses same-size tampered expense attachment bytes and an independently computed SHA-256 for the original bytes; restore must reject with a hash mismatch. This directly pins the verifier's negative digest branch without changing restore behavior, thresholds or exclusions. An initial verifier-only test attempt could not start because the worktree lacked an installed Vitest executable (`vitest` not recognized). After the frozen-lockfile install, focused verifier tests and subsequent combined CLI/helper/verifier tests passed; see the exact-head local evidence report. CLI branch tests now execute the CLI module with isolated arguments, environment, console and module state; they cover invalid arguments, resolved restore calls, optional APP_DB_KEY, success output and both rejection shapes. Narrow helper orchestration tests mock filesystem/database/verifier adapters to cover missing attachment-directory acceptance, non-ENOENT propagation, invalid or empty integrity results, verifier rejection and connection closure. These complement—not replace—the existing real disposable restore integration cases. Focused exact-file coverage reports 100% for the CLI, restore helper and attachment verifier; this is not a global suite or CI claim. A later exact-head API CI run reported 98.99% global branches (threshold 99%); its per-file report showed `expense-attachments.ts` at 90% branches with uncovered missing-expense and uploaded-byte-size mismatch arms. Focused real SQLite/storage tests now pin missing expense list/add/download, empty batches, malformed sizes, and cleanup of an earlier staged file after a later byte-count mismatch, preserving existing links and expense rows. Local expense module coverage is 20/20 branches; the global CI cause is not inferred from rounded percentages.

A subsequent hosted review identified that a zero-byte copied `tuari.sqlite` could be initialized as an empty SQLite database and incorrectly reported as a successful restore. The restore helper now rejects a copied database of size zero before opening SQLite. A real disposable test first reproduced the false success on the unfixed helper, then asserts rejection and unchanged source bytes; a helper orchestration test verifies the connection factory is not called for an empty copy. Valid historical databases without attachment tables and encrypted compatibility are unchanged and carried forward; no crypto, schema, policy, or backup CLI redesign.
