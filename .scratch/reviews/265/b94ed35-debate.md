# Debate — issue #265 (Composition root follow-ups) — final review round

**Head:** `b94ed35` (post-evidence delta: rebase onto develop @ 6481df9 — PR #347 conflict resolution; SHA refreshed from 0f1269b)
**Base:** `origin/develop` @ `3c1449043bab7dd28cba4d13b1e072ae1f3999ca` (merge-base == base; branch `refactor/issue-265` rebased)
**Tier:** High-assurance (crypto key path — "highest-severity open item in the audit" per owner comment).
**Lane state:** completed worker lane; 7 commits (`e29c746`…`d8acada`). This is the final review round against the full diff `origin/develop...HEAD`.

Method: fresh-context single reviewer, adversarial critic/defender synthesis per the debate skill. Every finding verified against the actual diff at HEAD and, where relevant, primary sources (issue #265 body + owner guardrail comment via `gh`, current SQLCipher API docs). Test claims re-verified by executing the suites (see Verification).

---

## What was reviewed

`git diff origin/develop...HEAD` — 23 files, +1960/−220. Scope:

- **apps/api**: `app/shutdown.ts` (new) + `shutdown.test.ts`, `app/dependencies.ts`, `app/index.ts`, `config/loader.ts`, `infrastructure/database/database-key-manager.ts`, `database-key-persister.ts` (new), `schema.ts` (executor threading), `rpc/handlers/system.ts`, `rpc/router.ts`
- **apps/desktop/src-tauri/src/lib.rs**: `rotate_db_key` / `restore_db_key` / `complete_db_key_rotation` + `SecretStore::delete`
- **apps/web**: `recovery-key-hooks.ts` desktop orchestration
- **packages/contracts**: `security.ts` (`rekeyed` flag on the discriminated output)

## Critic findings (raw, condensed — severity 1–10)

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | 9 | **Plaintext DB key written to `config.json` on the desktop — the primary encrypted deployment.** `dependencies.ts:224-226` builds the persister whenever `TUARI_CONFIG_FILE` is set, and the Rust shell sets `TUARI_CONFIG_FILE` **unconditionally** (`lib.rs:1958-1965`) while env-pinning `APP_DB_KEY` from the keyring (`lib.rs:1985-1988`, only when the `encrypted_db` license feature is present). So after every desktop rotation the API writes the new key **in plaintext** to `<app_data_dir>/Tuari/config.json` (`persister.ts:55-79`) — a user-writable directory that is *not* the owner-restricted secrets dir (`resolve_tuari_dir` vs `resolve_private_runtime_dir`/`restrict_dir_to_owner` 0o700 at `lib.rs:1475-1479`). The config copy is never even read on the desktop (env wins — `loader.ts:97-98`). This contradicts the design intent ("persister covers file-driven deployments and is the port's default contract; the desktop uses the OS keyring") and silently defeats the keyring's protection (ciphertext + key both readable by a file-level attacker). The previous review round dismissed this as a tradeoff *assuming* `configFilePath` is null on the desktop — that assumption is false. | **MUST-FIX.** One-line fix: build the persister with a null path when env `APP_DB_KEY` is set (persist only when the config value would actually be used), or gate inside the persister. |
| 2 | 7 | **Post-rekey verification failure is ambiguous but reported as `rekeyed: false` → the web restores the old key.** `manager.ts:191-199` returns "Database re-encryption failed" when the fresh connection cannot open the DB with the NEW key, and `system.ts:94` maps *every* `changeKey` failure to `rekeyed: false`; `recovery-key-hooks.ts:116-119` then restores the old key. But that failure does not tell you which key the DB is on: (a) rekey silently no-op'd (the SQLCipher WAL hazard the issue cites) → DB on OLD key → restore is correct; or (b) rekey applied but verification false-negatived (transient lock/binding error) → DB on NEW key → restoring orphans the DB. Cheap decisive check: after a post-rekey verification failure, probe with the OLD key — if the old key opens it, `rekeyed:false` is correct; if neither opens, report `rekeyed:true` (outcome unknown). | **SHOULD-FIX** (or defer with a follow-up issue + PR note). Common case (a) is handled correctly today; (b) is a narrow but catastrophic false-rollback. |
| 3 | 6 | **`restore_db_key_in_store` clears the rollback slot BEFORE the write succeeds** (`lib.rs:583-591`): `previous.take()` then `store.write(...)`. If the write fails transiently, the previous key is lost from the slot AND a subsequent `restore_db_key` hits the `None` branch and **deletes** the (new) key from the store — the DB (still on the old key) becomes unrecoverable. Reorder: write first, clear the slot only on success. | **SHOULD-FIX** — rollback-path robustness. |
| 4 | 5 | **Stale, factually wrong doc comment on a security-critical path.** `recovery-key-hooks.ts:96-99` says "the original key remains in the desktop's rollback slot until the app restarts" — false: `complete_db_key_rotation` clears the slot immediately (`lib.rs:597-600`; the hook calls it on success *and* on ambiguous failure, `hooks.ts:123-128`). The original key is dropped, not retained. A future reader will draw the wrong conclusion about the ambiguous-failure safety net. | **SHOULD-FIX** — comment fix. |
| 5 | 5 | **Rekey-on-WAL + the real SQLCipher binding is unverified end-to-end.** `factory.ts:60` sets `journal_mode = WAL` unconditionally, and the rekey runs on that shared connection (`manager.ts:186-189`). The issue calls out "incl. WAL" as the exact hazard. The post-rekey verification converts a silent failure into an honest wire failure (strictly better than pre-#265), but whether `PRAGMA rekey` actually *succeeds* on a WAL-mode SQLCipher connection is untested — the SQLCipher binding is absent from the workspace and every test injects fakes. If rekey errors in WAL mode, the feature always reports "Database re-encryption failed" on real deployments (honest, no data loss, but non-functional). | **SHOULD-FIX (verification)** — smoke-test on the desktop lane with the real binding before shipping; consider switching `journal_mode` around the rekey (DELETE → rekey → WAL) inside the adapter. |
| 6 | 4 | **Design deviation: `db_key` lost its min-length.** Design doc specifies `db_key: z.string().min(8).optional()`; implementation is `z.string().optional()` (`loader.ts:27`). A config containing `db_key: ""` resolves to a *plain* DB (empty string is falsy → `resolveDatabaseConstructor` returns plain better-sqlite3) — a silent decryption-grade misconfiguration footgun. | **SHOULD-FIX** (cheap) — restore `.min(8)` (matching the wire schema) or at least `.min(1)` with a comment. |
| 7 | 4 | **Persister writes into a config the loader may reject.** `persister.ts:55-68` validates only JSON-object shape; `loadConfigFile` (`loader.ts:38-55`) is stricter (zod field types). If the config file is invalid-but-object (e.g. `pg_port: "abc"`, edited mid-run), a rekey persists the key into a file the loader will ignore on restart → stale-key startup → DB loss. Narrow window (file edited between startup and rekey), severe consequence. Validate the merged document with `configFileSchema` before the rename. | **SHOULD-FIX** (cheap) or defer as follow-up. |
| 8 | 3 | **Crash window in the rotate→rekey handoff.** The rollback slot is in-memory only (`DatabaseKeyRotationState.previous`, `lib.rs:565-577`); a crash after `rotate_db_key` but before `restore`/`complete` leaves the keyring on the new key, the DB possibly on the old, and the old key unrecoverable (slot was RAM). Inherent to guardrail-1 ordering (rotate before rekey); a disk-persisted rollback file would close it. | **DEFERRED** — follow-up issue (see Residual risks). |
| 9 | 3 | **Shutdown force-exit timer is cleared before `close()` runs** (`shutdown.ts:73` clears, `:76` closes). A hanging `close()` has no force guard. better-sqlite3 `close()` is synchronous and fast — low real risk. | NIT — acceptable. |
| 10 | 2 | **Fallback path skips post-rekey verification.** When `encryption === null` (`:memory:`, missing, or <16-byte file) the rekey runs without a fresh-connection confirmation (`manager.ts:191-199` guards on `"encrypted"` only). Fine for `:memory:`/dev; a transiently unreadable real file would skip verification. | NIT — acceptable. |
| 11 | 2 | **No test pins the desktop-persister behavior (finding 1) or the restore-slot write ordering (finding 3).** The whole "desktop must not get a plaintext config copy" invariant is untested. | NIT — folded into the test-audit. |
| 12 | — | *Dismissed:* key-trim divergence between keyring and DB (rotate stores the raw key, RPC trims via zod). `SecuritySection` trims **both** keys before both calls (`security-section.tsx:80-93`), so the shipped flow cannot diverge. Only non-web callers of the Tauri command could store an untrimmed key. | **DISMISSED** (false alarm — the web layer normalizes). |
| 13 | — | *Dismissed:* on an ambiguous RPC failure the flow should restore instead of keep. Restoring could orphan a DB that WAS rekeyed; keeping the new key is the safer of the two bad options and matches guardrail-1 ordering. | **DISMISSED** (by design; documented in `hooks.ts:94-99`). |

## Defender highlights (what the lane does right)

- **Fresh-connection pre-verification neutralizes the owner-flagged flaw** — SQLCipher ignores `PRAGMA key` after the first read on the shared connection; `verifyKeyOnFreshConnection` (`manager.ts:98-116`) makes a wrong current key *actually* fail, and the scratch connection is always closed (`finally`). This is the correct fix for the #265 core bug (confidence 9).
- **Post-rekey fresh-connection verification** turns the silent WAL rekey failure into an honest wire failure — the DB can no longer report success while still on the old key (confidence 8).
- **Guardrail compliance is complete and faithful:** (1) Rust shell owns rotation, rotate-before-rekey (`lib.rs:565-579`), (2) fresh-connection verification, (3) explicit "Database is not encrypted" via a bounded 16-byte header read (`manager.ts:71-96` — never reads the whole DB), (4) discriminated `DatabaseKeyChangeResult` kept and extended with `rekeyed` (guardrail 4 from #268 preserved).
- **The final hardening round is real, not cosmetic:** empty-key guard (`manager.ts:156-160`), non-object config parse guard (`persister.ts:60-62`), pid-suffixed tmp + fsync + atomic rename (`persister.ts:70-78`).
- **restore-only-on-definitive-failure + complete-on-ambiguous** (`hooks.ts:110-128`) is the right resolution of the rollback-vs-orphan trade-off, and the `rekeyed` wire flag makes the decision data-driven rather than guessed.
- **Shutdown** (`shutdown.ts`) matches the design: stop → close → exit ordering, idempotency, injectable `exit`, force-exit guard, listener cleanup.
- **Schema threading** (`schema.ts`) is mechanical and complete: no module global remains, every helper takes `db`, exported `apply*` signatures unchanged, and the full schema-migrations suite stays green.

## Synthesis

- **Must-fix (1):** #1 — desktop plaintext key in `config.json`. One-line fix; do not ship the crypto path without it.
- **Should-fix (4):** #2 (post-rekey verification discrimination), #3 (restore-slot ordering), #4 (stale comment), #5 (real-binding WAL-rekey verification — at minimum a smoke test).
- **Cheap should-fix (2):** #6 (`db_key` min length), #7 (validate merged config before rename).
- **Deferred (1):** #8 (in-memory rollback slot crash window — follow-up issue: persist the pre-rotation key durably or accept + document).
- **Dismissed (2):** #12 (trim handled at the web layer), #13 (keep-new-key on ambiguity is the safer choice).
- **Nits (2):** #9, #10 — acceptable as-is.

## Verification after fixes (this round)

- API suite: **1099/1099 passed** (65 files) — includes manager 13, persister 8, shutdown 7, router rekeyed-path tests, loader merges, schema-migrations.
- Contracts: **131/131 passed** (`rekeyed` discriminated-union tests).
- Web hooks: **7/7 passed**; web `tsc --noEmit` clean.
- API `tsc --noEmit` clean; `eslint` clean on the changed API files.
- Rust `cargo test --lib`: **103/103 passed** (4 new DB-key rotation tests).
- Clippy `-D warnings` not re-run this round (claimed green in the lane's own verification).

## Residual risks

1. **#1 (must-fix)** is still open in the code — the desktop writes a plaintext key copy on every rotation until fixed.
2. **#5** — rekey-on-WAL against the real SQLCipher binding is unverified; the feature may fail honestly (never succeed) on real encrypted deployments until verified.
3. **#2** — post-rekey verification failure can, in a narrow case, trigger a rollback that orphans a rekeyed DB (mitigation suggested: old-key probe).
4. **#8** — crash in the rotate→rekey window loses the pre-rotation key (in-memory slot).
5. `rekeyed: true` + persist-failure on a non-desktop deployment leaves the new key durable nowhere — honest error surfaced, but the restart loses the DB (documented tradeoff, deferred).
6. The SQLCipher path is exercised only through fakes in this workspace; the desktop lane needs a live-binding smoke test before the feature is declared shippable.

---

## Post-evidence delta (fix loop, SHA `0105e489`)

This review ran against `d8acada`; the fix loop landed as commit `0105e489`
("fix(api,desktop,web): address #265 review findings…"), resolving the
open dispositions:

- **#1 (must-fix, plaintext desktop key) — FIXED.** `dependencies.ts` now
  builds the persister with a null path when `APP_DB_KEY` is set (env-pinned
  deployments — the desktop host — never write a plaintext config copy; the
  config `db_key` would be unread anyway because `mergeConfigIntoEnv` only
  consults it when env is unset). Pinned by a new `dependencies.test.ts` case
  (E1): `APP_DB_KEY` set + `TUARI_CONFIG_FILE` set → `persistKey` is a no-op
  and no config file is created.
- **#2 (post-rekey verification discrimination) — FIXED.** After a failed
  post-rekey fresh-connection verification, the manager probes with the OLD
  key: the old key still opens the DB → `rekeyed: false` (rekey silently
  no-op'd; restore is safe); neither key opens it → `rekeyed: true` (DB is on
  the new key; restoring would orphan it). The wire contract now carries the
  port's discrimination (`system.ts` propagates `result.rekeyed ?? false`).
  Manager + router tests pin both branches.
- **#3 (restore-slot ordering) — FIXED.** `restore_db_key_in_store` writes the
  previous key BEFORE clearing the slot (`previous.as_ref()` then clear on
  success), so a transient write failure no longer loses the pre-rotation key
  (which would make a retry DELETE the new key). New Rust test forces a write
  failure and asserts the slot survives + a retry succeeds.
- **#4 (stale comment) — FIXED.** `recovery-key-hooks.ts` doc now states the
  original key is intentionally dropped (slot cleared) on acknowledge.
- **#5 (real-binding WAL rekey verification) — DEFERRED, still open.** The
  SQLCipher binding is absent from this workspace (the desktop typecheck
  falls back to plain better-sqlite3); a live-binding smoke test remains a
  landing-lane prerequisite. Honest failure behavior is unchanged.
- **#6 (db_key min length) — FIXED.** `loader.ts` restores
  `db_key: z.string().min(8).optional()` (mirrors the wire schema; a blank
  value would silently resolve to a plain DB). Loader test pins the rejection.
- **#7 (persister writes configs the loader rejects) — FIXED.** The persister
  validates the merged document with `configFileSchema` before the rename and
  fails honestly when the loader would ignore it; a round-trip test pins that
  a persisted config loads back.
- **#8 (in-memory rollback slot) — DEFERRED (documented).** Crash between
  `rotate_db_key` and rekey/restore/complete still loses the pre-rotation key
  (RAM-only slot). Tracked as a follow-up; do not implement in this PR.
- **#9/#10 (nits) — #9 fixed** (force-exit guard now stays armed through
  `close()` and is cleared only after cleanup; close-failure test added).
  **#10 kept as documented** (fallback path verification is meaningless for
  `:memory:` and only reachable on dev/test files).

Re-verified after fixes: API 1109/1109, contracts 131/131, web 484/484
(incl. hooks 8/8), Rust `cargo test --lib` 105/105, `cargo clippy --lib`
clean, `tsc --noEmit` + eslint clean.

---

## Post-evidence delta — Greptile P1 fix round (SHA refreshed 0105e48 → 0d47056)

Greptile P1 fix round (PR #347); evidence renamed to final code SHA per
`process.md`. Two fixes, both in `apps/api/src/infrastructure/database/`:
persister writes the key-bearing config via a tmp file opened with explicit
`0o600` mode; key-manager post-rekey probes are tri-state and a probe that
could not verify the new key never reports `rekeyed: true` (ambiguous
failure → caller keeps the old-key rollback slot). Re-verified: typecheck
4/4, `test:api` 1109 passed | 1 skipped, `test:web` 484 passed. See
`0d47056-code-review.md` delta note for details.

## Post-evidence delta (0f1269b — Greptile re-review round 3, tri-state rekey verification)

Greptile re-review flagged two P1s (same root cause) on the post-rekey probe
path: a transient probe failure after a successful rekey was reported as
plain `rekeyed: false`, which the desktop caller read as definitive failure
and restored the OLD key → the re-encrypted database could not be opened on
the next startup. This round made the outcome tri-state:

- Definitive wrong-key rejection (probe ran, SQLITE_NOTADB) → `rekeyed:
false` with no `ambiguous` — restoring the old key is safe (unchanged).
- Probe could NOT run (transient lock/binding/connection/file error) →
`rekeyed: false` + `ambiguous: true` — the caller keeps the new key AND the
rollback slot, surfaces "rekey applied but verification pending", and does
not restore.
- Verified probe → `rekeyed: true` (unchanged).

The wire schema carries the optional `ambiguous` flag (a refine rejects it
combined with `rekeyed: true`); the web hook branches on `ambiguous` before
`rekeyed` so it never restores on ambiguity. Both critic P1s are addressed
by this delta; no remaining critic finding applies to the changed lines.
Re-verified: contracts build + 131 tests, typecheck 4/4, lint 2/2,
`test:api` 1110 passed | 1 skipped, `test:web` 485 passed. No Rust touched.

## Post-evidence delta (b94ed35 — rebase onto develop @ 6481df9, PR #347 conflict resolution)

Rebased all 13 #265 commits onto the advanced develop (3c14490 → 6481df9;
merged #342/#345/#349/#350/#351). The only content conflict was
`schema.ts`: #265 removed the module-global `getExecutor` while #351 added a
`getExecutor()`-based payment-FK RESTRICT migration. Resolved by threading
`db` through the new migration (both behaviors intact — no #265 feature
lost, none of develop's merged features lost). `dependencies.ts` and
`packages/contracts/src/index.test.ts` auto-merged cleanly and were
verified to contain BOTH sides' changes. Re-verified on b94ed35: contracts
build + 158 tests, typecheck 4/4, lint 2/2, `test:api` 1170 passed | 1
skipped, `test:web` 486 passed. No Rust touched. See the code-review delta
note for the file-level resolution list.
