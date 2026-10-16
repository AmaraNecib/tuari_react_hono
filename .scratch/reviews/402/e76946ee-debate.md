# #402 debate review — `fix-encryption-fallback`

- issue: #402 "build-sidecar silently ships without SQLCipher while APP_DB_KEY is set"
- base SHA: `ec369a30` (origin/develop branch point) · HEAD: `e76946ee`
- diff: `git diff ec369a30...e76946ee` (19 files, +3786 −198)
- spec: `.scratch/implementation/402-design.md`
- reviewer: single agent playing both roles (critic then defender). No source edited.
- scope: implementation only (build-sidecar, sqlcipher-availability, runtime-staging,
  factory.ts). Test quality is owned by test-audit and is NOT judged here.

Evidence gathered:
- `.agents/wisdom/desktop-packaging.md` (the 8 prior #409 rounds the code implements)
- full read of `build-sidecar.mjs`, `sqlcipher-availability.mjs`, `runtime-staging.mjs`,
  `factory.ts`
- verified the fork's own loader + gyp output in
  `node_modules/.pnpm/better-sqlite3-sqlcipher@5.4.3-3/node_modules/better-sqlite3-sqlcipher`:
  - `lib/database.js:5` → `require('../build/better_sqlite3.node')`
  - `binding.gyp:37-44` → `place_resulting_binaries` copies
    `openssl/1.0.2s/<OS>_<arch>/bin/libeay32.dll` (Windows) into `build/`
- `.gitignore:29-30` (only `bin/api-runtime/` and `bin/node.exe` are ignored)
- `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`,
  `scripts/smoke/installer-smoke.mjs` diffs

---

## ROLE 1 — HARSH CRITIC

Score: 1 = nit, 10 = must-fix blocker.

### C1 — The gate proves *loadability*, never that a keyed write is ciphertext (severity 4)

`sqlcipher-availability.mjs` `SQLCIPHER_PROBE_SOURCE` only asserts a load plus a
non-empty `PRAGMA cipher_version`:

```
'  const version = db.pragma("cipher_version", { simple: true });',
'  if (typeof version !== "string" || version.trim() === "") {',
```

`factory.ts:113-125` `assertBindingEncrypts` does the same at runtime. Neither ever
writes a row with a key and checks the file is not `SQLite format 3`. A fork build
that loads and reports a version but silently mis-handles the key would pass both.
The issue title is literally "ships *without* SQLCipher"; this does not prove that
"with SQLCipher" means "encrypted".

### C2 — The file is created (opened) before the capability probe (severity 3)

`factory.ts:142-149`:

```
const SqliteConstructor = resolveDatabaseConstructor(resolvedKey, loadSqlcipher)
const sqlite = new SqliteConstructor(resolvedPath)

if (resolvedKey) {
  sqlite.pragma(`key = '${escapeSqliteString(resolvedKey)}'`)
  sqlite.pragma("cipher_compatibility = 4")
  assertBindingEncrypts(sqlite)
```

better-sqlite3 opens with O_CREAT at construction, so a non-encrypting binding with a
key set creates a 0-byte plaintext file on disk *before* it is refused and closed. No
data is ever written, but the "refuse before touching disk" story is not literal.

### C3 — An empty-string key silently means "no encryption" (severity 2)

`factory.ts:145`: `const resolvedKey = dbKey ?? process.env.APP_DB_KEY ?? null`.
`APP_DB_KEY=""` (a common shell mistake) → falsy → plain better-sqlite3, no refusal,
`assertNotEncryptedWithoutKey` returns early because `key` is falsy. A whitespace or
empty key is treated identically to no key.

### C4 — `.gitignore` does not cover the staging / backup directories (severity 3)

`.gitignore:29-30` ignores only `/apps/desktop/src-tauri/bin/api-runtime/` and
`.../bin/node.exe`. `build-sidecar.mjs:33` stages under
`src-tauri/.bin-staging-<rand>` and `runtime-staging.mjs` creates
`src-tauri/bin.previous-<epoch>-<pid>`.
- `bin.previous-*` is recovered/swept on the next successful build (good).
- `.bin-staging-*` is removed only by the owning run's `finally`
  (`runtime-staging.mjs` `buildProbeAndPublishRuntime`). A SIGKILL / power loss /
  Ctrl-C leaves it, and **no recovery path ever scans for `.bin-staging-*`**. It then
  shows as untracked in `git status` and can be `git add -A`'d.

### C5 — A fresh marker with an unreadable pid freezes a tree for the whole lease (severity 2)

`runtime-staging.mjs` `isAbandonedBackup`: when the heartbeat is within the lease it
returns `owner !== null && owner.alive === false`. With `pid: null` (unparseable marker)
`owner` is `null`, so the result is `false` = *owned*, for up to `DEFAULT_MARKER_LEASE_MS`
(30s). Recovery of a genuinely dead tree is delayed 30s. Deliberate, but it is a stall.

### C6 — `resolveSqlcipher()` runs before the `try/finally` that removes staging (severity 1)

`build-sidecar.mjs:116` (`const sqlcipher = resolveSqlcipher();`) executes at module
scope, after `mkdtempSync` (line 30) but before the `try { buildProbeAndPublishRuntime… }
finally` block. Both of its failure modes are caught internally, so nothing throws today;
any future uncaught throw leaks `.bin-staging-*`.

### C7 — Over-engineering (severity 4 as complexity debt)

`runtime-staging.mjs` is 566 lines and `runtime-staging.test.mjs` is 1105 lines for what
is conceptually "build to temp, probe, rename". It carries a pid+start-time identity
system, a heartbeat lease, per-platform start-time readers, ownership markers,
crash-recovery, and a sweep.

### C8 — Windows `libeay32.dll` requirement could false-refuse a valid build (severity 5, then DISPROVED)

If the fork's gyp produced a differently named OpenSSL DLL, every valid Windows release
would fail the gate. **Disproved**: `binding.gyp:44` genuinely copies
`openssl/1.0.2s/<OS>_<arch>/bin/libeay32.dll`, matching
`SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH`. See C8 in synthesis.

### C9 — `portable:only` can zip a previously waived plaintext runtime (severity 4)

`apps/desktop/package.json`: `portable` = `pnpm run build && build-portable.mjs` (safe:
`tauri build`'s `beforeBuildCommand` re-runs the strict `sidecar:build`). But
`portable:only` = `build-portable.mjs` only. If a developer ran
`sidecar:build --allow-plaintext` (non-ephemeral) first, `portable:only` zips whatever
plaintext runtime is sitting in `bin/`.

### C10 — Files shorter than 16 bytes are refused as "encrypted or damaged" (severity 1)

`factory.ts` `readLeadingBytes` returns a short latin1 string; `assertNotEncryptedWithoutKey`
compares `!== SQLITE_HEADER` and throws. A truncated 1–15 byte file is refused. Safe
direction (SQLite needs a 100-byte header), but the message says "encrypted or damaged".

### C11 — `cipher_compatibility = 4` is set *after* `PRAGMA key` (severity 1)

Both the build probe and `factory.ts:147-148` order it key-then-compatibility. Fine for a
new DB because no page is read before the first query, and unchanged from pre-#402 code.

---

## ROLE 2 — CHARITABLE DEFENDER

Confidence 1–10.

### D1 — Gate-first ordering is real, not cosmetic (confidence 9)

`build-sidecar.mjs:250-258`: `enforceSqlcipherGate()` runs inside the `build:` callback,
which `buildProbeAndPublishRuntime` invokes **before** `swapRuntimeDirectory`. Nothing
under `bin/` is touched until the gate passes and the probe succeeds. This is exactly the
wisdom entry "a probe that runs after the destructive step is not a gate".

### D2 — The availability predicate matches the fork's real loader (confidence 10)

Verified against the installed package: `lib/database.js:5`
`require('../build/better_sqlite3.node')` ≡ `SQLCIPHER_ADDON_RELATIVE_PATH`. The old
`build/Release` check (plain better-sqlite3's layout) was the #402 defect; the fix is
provably correct, not assumed.

### D3 — The Windows DLL check is correct (confidence 9)

`binding.gyp:44` copies `libeay32.dll`; the predicate requires it on win32. Presence is
then re-verified by a real load, so even a missing `libgcc_s_dw2-1.dll` is caught by the
probe rather than shipping.

### D4 — Loadability is the right gate for the *build*, and encryption is proven in CI (confidence 7)

Building the fork to prove a keyed write needs the C++ toolchain that the gate is trying
to detect. The build probe deliberately stops at "loads + reports a cipher version"; the
write/read-back proof is `backup.encrypted.test.ts` + #410. The comment block
(`SQLCIPHER_PROBE_SOURCE` docstring) states this limit honestly.

### D5 — The waiver covers every refusal the path can produce (confidence 8)

Wisdom round 4's lesson is implemented: `probeStagedRuntime` catches a load failure and,
when waived, warns and publishes; `resolveSqlcipherArtifact` skips node-gyp only for
`plaintextAllowed && ephemeral`. Both failure modes (absent, present-but-unloadable) are
covered, which is what the "escape hatch must cover every failure mode" entry demands.

### D6 — Runtime refusal is genuine defence-in-depth against a bad bundle (confidence 8)

`assertBindingEncrypts` closes the handle before throwing (`factory.ts:116-119`,
`123-125`), so no plaintext connection survives. `resolveDatabaseConstructor` also
preserves the underlying cause instead of swallowing it. A mis-built bundle cannot serve
a plaintext DB under a key.

### D7 — `assertNotEncryptedWithoutKey` turns an opaque failure into an actionable one (confidence 8)

`factory.ts:75-90` names both possibilities rather than asserting one, matching the
licensing-architecture §8.3 downgrade case. Reads 16 bytes only (cheap) and returns early
for `:memory:` and for a missing/empty/plaintext file.

### D8 — The complexity is earned round-by-round, not speculative (confidence 8)

Every mechanism in `runtime-staging.mjs` maps to a named prior failure in
`.agents/wisdom/desktop-packaging.md`: post-publish cleanup warns instead of throwing
(round 3), claiming ownership is fatal before the rename (round 5d), identity is
pid + start time with the lease as fallback (rounds 5b/5e), and a swap recovers its own
interrupted run. Terse code here regresses a documented outage.

### D9 — Fail-closed is the correct default for a licensing/edition defect (confidence 9)

The artifact is edition-agnostic, so an unencryptable artifact can never honour an
`encrypted_db` licence. Failing the release build is cheaper than a silently downgraded
customer database.

---

## ROLE 3 — SYNTHESIS (classify each finding)

| # | Finding | Sev | Verdict | Reason |
|---|---|---|---|---|
| C1 | Gate proves loadability, not ciphertext-on-disk | 4 | **defer** | Documented in code + docs; a keyed-write proof is impossible without the toolchain the gate detects; `backup.encrypted.test.ts` + #410 own it. |
| C2 | File opened before the capability probe | 3 | **dismiss** | No row/schema is ever written before the refusal; only a 0-byte file can result. Not a data leak. |
| C3 | Empty-string key ⇒ plaintext | 2 | **defer** | Defensible reading of "no key"; a stricter warning is a follow-up, out of #402 scope. |
| C4 | `.gitignore` misses staging/backup dirs | 3 | **fix-now** | One-line, cheap, prevents untracked litter and accidental commits. Reviewer may not edit source; parent to apply. |
| C5 | Fresh marker + unreadable pid freezes tree 30s | 2 | **dismiss** | Deliberate conservative bias; a 30s delay on recovery is strictly safer than stealing a live tree. |
| C6 | `resolveSqlcipher()` outside `try/finally` | 1 | **dismiss** | Both failure modes are caught internally; nothing throws today. Defensive-ordering nit only. |
| C7 | 566-line staging module + 1105-line test | 4 | **dismiss** | Every mechanism maps to a documented regression (D8). Consolidation is a separate refactor, not an #402 change. |
| C8 | Windows DLL name could false-refuse | 5 | **dismiss** | Disproved: `binding.gyp:44` copies exactly `build/libeay32.dll`. |
| C9 | `portable:only` can zip a waived plaintext runtime | 4 | **defer** | Release path (`portable`) is safe via `beforeBuildCommand`; `portable:only` is a dev convenience. Worth an issue: have `build-portable.mjs` re-run the strict build or refuse a waived bin. |
| C10 | <16-byte file refused | 1 | **dismiss** | Truncated files are invalid SQLite; refusing is the safe direction. |
| C11 | key-then-compatibility order | 1 | **dismiss** | No page read before first query; unchanged from prior code. |

### Fix-now (apply before push)

1. **C4** — add the two staging/backup patterns to `.gitignore`, after line 30:
   ```
   /apps/desktop/src-tauri/.bin-staging-*/
   /apps/desktop/src-tauri/bin.previous-*
   ```
   (Cheap, one commit, kills untracked litter from an interrupted build. No source logic
   changes.)

### Deferred (create an issue, reference in the PR)

- **C1** — keyed-write-on-disk proof is #410's native CI job; already tracked.
- **C3** — warn/refuse when `APP_DB_KEY` is set but empty/whitespace.
- **C9** — make `portable:only` refuse a waived plaintext `bin/` (or re-run the strict sidecar build).

### Dismissed (note in PR that they were considered)

- C2, C5, C6, C7, C8 (disproved by `binding.gyp:44`), C10, C11.

## Verdict

**Clean, no hard blockers.** The gate runs before any destructive step, the availability
predicate matches the fork's actual loader path and Windows DLL
(`binding.gyp:44`), the waiver covers both refusal modes, and the runtime
`assertBindingEncrypts` closes before throwing. One cheap fix-now (`.gitignore` for the
staging/backup directories); three deferred items with a clear path (C1 = #410, C3, C9).
No file other than this evidence document was written.
