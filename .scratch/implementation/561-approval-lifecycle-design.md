# PR 561 approval lifecycle fixes

Base: `fix/salary-approval-ui-followup` at `2fb17eb6fdcf74dc06d167eb42a455bba570a90b`
Worktree: `D:/worktrees/tuari_react_hono/t3-54a4bb66-725be0b9455a830c`
Mode: `focused-local / CI-final-enforced`; current-head CI failed and is not accepted.
Tier: High assurance. Approval lifecycle affects money UX and frozen retry/recovery.

## Scope and design

Fix two reported behaviors in `EmployeeEarningApprovalForm`. Focus the first invalid control after a failed local or server validation result, not after each issue-state edit. On successful mutation, clear storage only when it still contains the completed request. Reset the form and call `onComplete` only while the original active form and employee identity remain current. Unmounting, changing employee identity, or leaving via `active={false}` makes an in-flight reply stale for UI updates, but does not prevent its matching storage cleanup.

No math, payload, domain, schema, payment, or retry semantics change. The component interface stays the same; no seam moved. Existing storage recovery and uncertain-failure behavior remain covered by its retry tests.

## Proof and lessons

Add regressions for focus retention during multi-character correction, refocus on a later failed save, focus after a server no-write validation, and a deferred success after unmount while a different employee form has unsaved entries. Existing tests cover mounted success navigation, uncertain failure and frozen retry.

Applied wisdom: `architecture/reset-effects-must-key-on-every-input-their-defaults-depend-on-and-track-edits-per-field.md` reinforces keeping identity changes separate from same-record updates; this fix uses identity as a guard against stale completion, not a form reset. `testing/flaky-findby-waitfor-under-full-suite-load-raise-the-file-s-asyncutiltimeout.md` supports condition-based waits for deferred completion, though the focused tests do not change the file timeout.

Impeccable context reported `NO_PRODUCT_MD`. The existing form and `DESIGN.md` are the product context. `impeccable/reference/product.md` is absent and was not retried or created.

The bounded review found the same lifecycle and request-identity guards missing from rejection paths. The parent correction applies the current-submission predicate to all asynchronous UI updates, including storage failures. Proven no-write rejections remove only their matching stored request, even after navigation. Deferred rejection regressions cover both a changed employee and an inactive form while preserving a newer same-identity recovery request.

Parent integration worktree: `D:/worktrees/tuari_react_hono/t3-412838f5-c2c7983838174217`.

No unrelated contracts inventory, audit, or legacy fixture files are in scope. Local proof is focused; hosted CI acceptance remains failed/unaccepted at handoff.
