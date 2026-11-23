# Issue 592: attachment navigation

## Scope and authority

Worktree: D:/worktrees/tuari_react_hono/t3-d8641a5e-fe345574c02b1ea2.
Base: 5b09d7213f5fd8d990a8b20cd3e5a80abdbca21f, current origin/develop at task start.
Spec: https://github.com/AmaraNecib/tuari_react_hono/issues/592.
Verification: focused-local / CI-final-pending. No protection or CI thresholds change.
Review: three distinct initial lenses, debate then test-audit then code-review.
Security-sensitive routing can expose private attachment bytes, so routine review is ineligible.

## Contract and design

An attachment is an inventory invoice group's stored file. Only the bootstrap owner may read it. Browser navigation through the rendered noreferrer link omits Origin and Referer. The inventory prefix currently blocks it before session authorization.

Keep the existing origin middleware. Select its existing safe-method option only for the exact single-segment attachment-read path. GET and HEAD without Origin reach existing session, owner and resource checks. Explicit untrusted origins and unsafe methods remain blocked. All other inventory paths and RPC policy stay unchanged. Do not use Referer or Sec-Fetch headers as authorization. Do not alter storage, license policy, schema, dependencies, payroll or UI.

The transport owns origin policy; the inventory module owns resource lookup and file bytes. No new exported interface or module. Deletion of the path selection restores the reproduced 403. Two existing middleware instances share the same policy implementation rather than duplicating origin checks.

## Proof

Use the issue-requested HTTP and real browser-link interfaces. Extend selected-http integration for plain and encrypted native databases with originless authorized bytes/content type, anonymous and nonowner refusal, missing resource, explicit unsafe origins, unsafe upload and unrelated-route refusal. Preserve existing attachment storage and upload checks.

Add a connected-exact browser test using real bootstrap cookies, real purchase creation and upload, reload, actual rendered link click and popup. Assert absent Origin/Referer, status 200, exact PNG bytes/type and rendered image. Register it in the existing connected suite and typecheck scope. No mocked auth, middleware bypass or real owner database.

Expected-red native integration produced 403 instead of 200 in both cases. Focused API suite then passed 42 tests. Browser link passed one case. Logs stay ignored under .scratch/reviews/592. The contracts package needed compilation after frozen-lockfile dependency installation; no dependency versions changed.

## Wisdom

The matching multipart allocation lesson applies to upload buffering, which is untouched. No repeated lesson is added.

## Acceptance boundary

Local proof and reviews do not establish hosted acceptance or issue closure. Publication, hosted review and effective protection remain separate merge gates.
