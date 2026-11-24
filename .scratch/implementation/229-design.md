# Issue 229: focused recovery-key revocation lookup

## Scope and base

Worktree: `D:/worktrees/tuari_react_hono/t3-49b12bb0-1bc766054fa3d1f1`.
Base: freshly fetched `origin/develop`, `3e79ae5b4b424d6e2180b5efed7cad3c4f9ae7eb`.
The assigned branch was clean and fast-forwarded before edits. Live issue 229 has no assignee. No competing issue-229 worktree was listed. Issue 613 concerns manual settlements and has no recovery-key overlap. Two router test stubs need the new port member; no router behavior changes. PR 617 is not a dependency.

Mode: focused-local / CI-final-pending. Effective ruleset 26837184 is active; parent owns final enforcement and hosted acceptance checks. High-assurance review applies because this changes a recovery credential read path. Debate, test-audit and code-review remain required in separate sessions. This worker cannot spawn children and hands those sessions to the parent.

## Decision

Add `findKeyById` to the existing RecoveryKeyPort seam, returning only `id` and `status`, or null. The SQLite adapter selects those two columns with a primary-key predicate and limit one. Returning the full record would unnecessarily expose keyHash to revocation. Leaving listAllKeys().find() retains precisely the exposure issue 229 asks to remove.

Both the public locked method and transaction-scoped unlocked view support the lookup. The service keeps the AVAILABLE check and guarded updateKeyStatus operation. A stale read therefore cannot overwrite a concurrent consume or revoke. Pool listing, hash-based consumption, RPC authorization, schema and cryptography stay unchanged.

Recovery key, status and revocation retain their existing domain meaning. No glossary or ADR change is needed. The existing port and adapter remain the modules; no new seam or pass-through module is added. Removing the adapter would put SQL and connection-lock ownership back into the service. The narrow projection is local to the adapter; no duplicated writer or lock implementation is introduced. Parent architecture review should inspect this changed port interface and its direct callers only.

## Proof

The agreed service and port seams are tested through existing file-backed SQLite fixtures. Adapter proof checks identity selection among two keys, minimal returned fields, unknown IDs and transaction-scoped reads after a status transition. Service proof forbids the hash-bearing list during revoke, checks successful and repeated revoke, and restores listing to check pool state. Existing cases retain consumed/missing/blank refusal, transition timestamps and consume-versus-revoke concurrency. Selected router recovery cases preserve wire validation and rate limiting.

Expected-red evidence is kept locally under `.scratch/reviews/229/`. Adapter red fails because findKeyById does not exist. Service red fails because revoke reads the forbidden list. Contracts compilation is a prerequisite for API typecheck and router tests in this fresh checkout, not a product build. Full suites and browser checks remain CI-final; there is no UI change.

## Wisdom

Applied the async-port atomicity lesson: retain guarded CAS and connection-wide serialization, including the transaction view. No new transaction is opened by the lookup. Other recovery-file and key-input lessons concern different contracts and do not justify changes here. No repeated-lesson candidate.
