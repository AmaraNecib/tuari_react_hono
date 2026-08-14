# Test Audit — issue #265 (Composition root follow-ups) — final review round

**Head:** `0f1269b` (post-evidence delta: Greptile re-review round 3 — tri-state post-rekey verification: ambiguous probe failures no longer trigger an old-key restore; SHA refreshed from 0d47056)
**Base:** `origin/develop` @ `3c1449043bab7dd28cba4d13b1e072ae1f3999ca`
**Tier:** High-assurance (crypto key path).

Method: fresh-context single reviewer; the three audit lenses (edge-case hunter, coverage analyst, quality reviewer) applied to the changed test files and their sources, then synthesized. All suites re-executed (see Verification).

Test files in the diff: `database-key-manager.test.ts` (rewritten, 13 tests), `database-key-persister.test.ts` (new, 8), `shutdown.test.ts` (new, 7), `loader.test.ts` (+3), `dependencies.test.ts` (+1), `router.test.ts` (+4), `create-app.test.ts` (+1 stub), `recovery-key-hooks.test.tsx` (+7), `packages/contracts/src/index.test.ts` (+2 cases), Rust `lib.rs` tests (+4).

---

## Lens 1 — Edge case hunter

| # | Risk | Finding | Where it could break |
|---|------|---------|---------------------|
| E1 | 🔴 | **No test pins "persister must NOT write a plaintext key when `APP_DB_KEY` is env-pinned"** (the desktop deployment: `TUARI_CONFIG_FILE` set + `APP_DB_KEY` set). The `dependencies.test.ts` wiring test only covers the TUARI_CONFIG_FILE-set / APP_DB_KEY-unset case. The shipped desktop behavior (plaintext key written to `config.json` on every rotation) is unguarded by any test. | `dependencies.ts:224-226` + `persister.ts:46-79` — security regression is invisible to the suite. |
| E2 | 🔴 | **Post-rekey verification failure is not discriminated** — no test asserts what happens when the rekey *succeeded* but the fresh-connection check with the new key fails (manager returns "Database re-encryption failed" → `rekeyed:false` → web restores the old key). If the DB is actually on the new key, restore orphans it. | `manager.ts:191-199`, `system.ts:94`, `hooks.ts:116-119`. |
| E3 | 🟠 | **`restore_db_key_in_store` slot-clearing-before-write is untested** — no test covers a `SecretStore.write` failure during restore (the previous key is lost from the slot; a retry would then DELETE the new key). | `lib.rs:583-591`. |
| E4 | 🟡 | **Missing-file fallback untested** — `detectEncryption` returns `null` when `openSync` throws (missing file) → shared-connection path; only the <16-byte-file case is covered (`manager.test.ts` "too short" test). The missing-file branch is dead-untested. | `manager.ts:74-79`. |
| E5 | 🟡 | **Shutdown force-exit while `close()` hangs** — the timer is cleared before `close()` (`shutdown.ts:73-76`); the "force-exit" test only covers a hanging `stopServer`. | `shutdown.ts`. |
| E6 | 🟡 | **Web restore failure is never asserted** — the definitive-failure path swallows a failing `restore_db_key` (`.catch(() => {})`, `hooks.ts:118`); only the complete-failure swallow is tested. A silently failing restore leaves the keyring on the new key with the DB on the old — worth a test. | `hooks.ts:118`. |
| E7 | 🟡 | **Persister tmp cleanup on failed rename untested** — "leaves no tmp file behind" only asserts the success path; a failed `renameSync` (e.g. read-only dir) leaving a stale `.pid.tmp` file is not covered. | `persister.ts:70-78`. |
| E8 | 🟡 | **Double-rotation semantics untested** — no Rust test for rotate → complete → rotate (the second `previous` must be the first new key, not `None`). Current single-slot logic is correct, but nothing pins it. | `lib.rs:565-599`. |

## Lens 2 — Coverage analyst

**Acceptance-criteria mapping (issue #265 body):**
1. *Persist the new key after rekey* — covered: router success path asserts `persistKey(newKey)` called (`router.test.ts`), persister unit tests (write/preserve/create/overwrite), loader merge + env-wins tests. ✓
2. *Graceful shutdown* — covered: order, idempotency, failure logging, force-exit, timer-clear, listener cleanup (`shutdown.test.ts`). ✓
3. *Remove the schema executor global* — covered indirectly by the untouched `schema-migrations.test.ts` + `migration-runner.test.ts` staying green under the threading refactor. ✓

**Owner guardrail mapping:**
- G2 fresh-connection verification — covered incl. failure + scratch-close assertions (`manager.test.ts`). ✓
- G3 explicit unencrypted failure — covered (magic-header file → "Database is not encrypted", rekey never runs). ✓
- G4 discriminated result — contracts tests cover `rekeyed:false` / `rekeyed:true` / rejection of missing `rekeyed`. ✓
- G1 Rust shell rotation — 4 Rust tests (round-trip, delete-when-none, complete-keeps-new, blank-rejected). ✓

**Diversity:** good — the manager has 13 distinct paths (unencrypted, verify-ok, verify-fail, open-throws, post-rekey-verify-fail, short file, empty keys ×2, `:memory:` ×3 incl. a live connection, quote escaping ×2, rekey-throws). The web hooks cover 7 orchestration states (non-desktop, rotate-first, restore-on-definitive, keep-on-rekeyed:true, keep-on-thrown, rotate-fails, complete-fails-swallowed). Router covers success/persist-fail/short-circuit.

**Duplicates:** minor — the `:memory:` fallback is exercised 4× (mock pragma, mock throwing, live better-sqlite3, quote-escaping variants); acceptable redundancy for a crypto path, not worth removal.

**Missing (see also Lens 1):** E1 is the significant gap — the desktop/persister interaction, which is the review's must-fix finding, has no test; a regression there would be invisible to CI.

## Lens 3 — Quality reviewer

**Grade: A−** (A for structure and rigor, minus for the E1–E3 gaps that matter on a High-assurance path).

- Names: precise and behavior-describing ("fails with a re-encryption message when the post-rekey verification fails", "keeps the new key (does NOT restore) when the RPC throws"). ✓
- Async handling: all mutations awaited via `mutateAsync`; promises awaited before assertions. ✓
- Isolation: temp dirs (`mkdtempSync` + `rmSync` in afterEach), `vi.stubEnv`/`vi.unstubAllEnvs` pairing, fake timers restored in `finally`, listener counts asserted before/after. ✓
- Assertion quality: specific — invocation *order* (`mock.invocationCallOrder`), call counts, exact PRAGMA strings, "never called" negatives (`pragma`/`persistKey` not called on failure paths). ✓
- Nits: `vi.fn() as unknown as (code?: number) => never` casts in shutdown tests are a smell but necessary for the injectable-exit seam; `makeScratchMock` returning both `connection` and `close` is slightly redundant but harmless.

## Synthesis

| Finding | Action |
|---------|--------|
| E1 (desktop plaintext persister) | **Fix with the code fix** (persister must skip when `APP_DB_KEY` is env-pinned) + add a `dependencies.test.ts` case pinning "APP_DB_KEY set + TUARI_CONFIG_FILE set → no config file written". |
| E2 (post-rekey verification discrimination) | **Fix with the code fix** (old-key probe) + add the discriminating manager test. |
| E3 (restore-slot ordering) | **Fix with the code fix** (write-before-clear) + Rust test for a failing `write`. |
| E4–E8 | **Fix (cheap):** add the missing-file fallback test, shutdown close-hang force-exit test, web restore-swallow test, persister failed-rename tmp test, double-rotation Rust test. |

## Verification (this round)

- `database-key-manager.test.ts` + `database-key-persister.test.ts` + `shutdown.test.ts` + `loader.test.ts`: 43/43 ✓
- `router.test.ts` + `dependencies.test.ts` + `create-app.test.ts`: 59/59 ✓
- Web `recovery-key-hooks.test.tsx`: 7/7 ✓
- Contracts `index.test.ts`: 131/131 ✓
- Full API suite: 1099/1099 (65 files) ✓
- Rust `cargo test --lib`: 103/103 ✓

---

## Post-evidence delta (fix loop, SHA `0105e489`)

This audit ran against `d8acada`; the fix loop landed as commit `0105e489`
with the recommended code fixes + tests:

- **E1 (desktop plaintext persister) — FIXED with test.** `dependencies.ts`
  gates the persister to a no-op when `APP_DB_KEY` is env-pinned; new
  `dependencies.test.ts` case pins "APP_DB_KEY set + TUARI_CONFIG_FILE set →
  `persistKey` succeeds and NO config file is written".
- **E2 (post-rekey discrimination) — FIXED with test.** Old-key probe in the
  manager (`rekeyed: true` when neither key opens the DB, `rekeyed: false`
  when the old key still does); two new manager tests + a router test pin the
  wire propagation; the unencrypted-failure path keeps `rekeyed: false` (the
  pre-existing "rejects an unencrypted database file" test asserts it).
- **E3 (restore-slot ordering) — FIXED with test.** `restore_db_key_in_store`
  clears the slot only after a successful write; new Rust test forces a write
  failure and asserts the slot survives.
- **E4 (missing-file fallback) — FIXED.** New manager test: a non-existent
  database path falls back to shared-connection verification.
- **E5 (close-hang force-exit) — FIXED.** Force-exit timer is cleared only
  AFTER `close()` runs; new shutdown test pins that a failing `close()` still
  exits cleanly once with the timer disarmed. (A synchronous `close()` cannot
  truly "hang" the event loop — the reorder makes the guard cover both
  cleanup steps for when close is ever made async.)
- **E6 (web restore-swallow) — FIXED.** New hooks test: a failing
  `restore_db_key` is swallowed and the original RPC failure still surfaces.
- **E7 (persister tmp cleanup on failed rename) — FIXED.** The persister now
  unlinks the pid-suffixed tmp file best-effort on any failure; new test
  forces a rename failure (via a wrapped `renameSync` mock) and asserts no
  stale `.tmp` remains.
- **E8 (double rotation) — FIXED.** New Rust test: rotate → complete →
  rotate remembers the first new key for rollback.

Re-verified: full API 1109/1109 (65 files; manager 17, persister 11,
shutdown 8, loader 8, dependencies 8, router rekeyed-path tests), web
484/484 (hooks 8/8), contracts 131/131, Rust `cargo test --lib` 105/105.

---

## Post-evidence delta — Greptile P1 fix round (SHA refreshed 0105e48 → 0d47056)

Greptile P1 fix round (PR #347); evidence renamed to final code SHA per
`process.md`. Test changes in this round: persister gains a POSIX-only mode
assertion (0600 on the renamed config); key-manager replaces the two old
`rekeyed` discrimination tests with (1) transient post-rekey probe failure →
`rekeyed: false` (both-probes-fail path — the Greptile P1 headline) and
(2) definitive `SQLITE_NOTADB` rejection → `rekeyed: false`; `router.test.ts`
comment refreshed (the port's `rekeyed: true` now only reflects a verified
rekey whose persistence failed). Re-verified: `test:api` 65 files, 1109
passed | 1 skipped (manager 17, persister 12, router rekeyed-path tests);
`test:web` 59 files, 484 passed; typecheck 4/4.

## Post-evidence delta (0f1269b — Greptile re-review round 3, tri-state rekey verification)

New tests for the tri-state outcome (Greptile P1 round):

- **Port** `database-key-manager.test.ts`: transient post-rekey probe →
`{ rekeyed: false, ambiguous: true }` with the "could not be verified" error
(2 tests, renamed to the tri-state contract); definitive SQLITE_NOTADB
rejection stays plain `rekeyed: false` (1 test, comments refreshed).
- **Router** `router.test.ts`: the handler forwards the port's `ambiguous:
true` unchanged through the wire (1 new test).
- **Web hook** `recovery-key-hooks.test.tsx`: ambiguous result → keeps the
new key AND the rollback slot — asserts `restore_db_key` AND
`complete_db_key_rotation` are both NOT invoked (1 new test).
- **Contracts** `index.test.ts`: `{ rekeyed: false, ambiguous: true }`
parses; `{ rekeyed: true, ambiguous: true }` rejected (2 new pins).

This closes the previous audit's E2 gap precisely: the "rekey succeeded but
post-rekey verification failed" case is now discriminated into ambiguous
(no restore) vs definitive (restore), each pinned at port, wire, and
orchestration level.

Re-verified on 0f1269b: `pnpm --filter @tuari/contracts test` (131 passed),
`pnpm test:api` (65 files, 1110 passed | 1 skipped), `pnpm test:web` (59
files, 485 passed), typecheck 4/4, lint 2/2. No Rust touched.
