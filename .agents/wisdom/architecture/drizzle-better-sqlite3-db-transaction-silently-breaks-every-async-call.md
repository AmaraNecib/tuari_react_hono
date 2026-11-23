## Drizzle better-sqlite3 `db.transaction(async …)` silently breaks every async call (🟠 Major)

Issue #249's honest-coverage tests exposed a latent production bug: `DrizzleAccountRepository.withTransaction` called `this.db.transaction(async (tx) => …)`. Drizzle's better-sqlite3 driver wraps the **synchronous** better-sqlite3 transaction API, so an async callback makes it throw `Transaction function cannot return a promise` at runtime. Every account profile update / password-change record was crashing in production, while all unit tests passed because they mocked the repository. The code *looked* correct and type-checked fine.

Fix pattern, the 3rd instance of the #195 lesson, now in bootstrap, recovery-key, and account: own the transaction on the raw connection (`this.db.$client` for Drizzle repos): `if (!raw.inTransaction) raw.exec("BEGIN IMMEDIATE")`, run the async callback, `COMMIT`/`ROLLBACK` on success/failure, wrap ROLLBACK in try/catch so a failing COMMIT surfaces the original error, and serialize through a FIFO promise-chain lock so no other repo call joins the open transaction. `raw.inTransaction` join keeps an externally-opened transaction working (outer owns COMMIT/ROLLBACK).

**Always**: when a Drizzle better-sqlite3 repository is first wired to a service with async transaction callbacks, exercise it against a real `:memory:` DB before shipping. The sync-only transaction contract is invisible to typecheck and mocked tests. Also: each new hand-rolled FIFO lock is drift risk (three copies now, with the guarded-ROLLBACK fix applied to only one), tracked as #288.

