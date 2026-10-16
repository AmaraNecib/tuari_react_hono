# Design pass — #402 @ e76946ee

Scope: `git diff ec369a30...e76946ee` (19 files). Skills applied:
`domain-modeling`, `codebase-design`, `improve-codebase-architecture`
(vocabulary: **module / interface / depth / seam / adapter / leverage / locality**,
deletion test, "one adapter = hypothetical seam, two = real"). Incremental: only
what this diff worsened, plus cheap cleanups it exposes.

Method: read `.agents/wisdom/desktop-packaging.md`, `CONTEXT.md`,
`.scratch/implementation/402-design.md`, the full changed files
(`factory.ts`, `build-sidecar.mjs`, `sqlcipher-availability.mjs`,
`runtime-staging.mjs`, both API test files, docs/ and `installer-smoke.mjs` diffs).
Ran `node --test scripts/sqlcipher-availability.test.mjs
scripts/runtime-staging.test.mjs` → 45 tests, 45 pass, 0 fail (11.4 s).
Line numbers below come from `grep -n` on the working tree; where I cite a
function rather than a line it is because I read the body without numbering.

## Hard violations

**None found.** The diff meets #402 as designed: the build fails instead of
packaging an unverified runtime (build-sidecar gate → staging → probe → publish),
the runtime refuses a keyed open on a non-encrypting binding
(`factory.ts:113` `assertBindingEncrypts`), and the new rules are documented in
the same vocabulary the repo already uses (`gate`, `probe`, `waiver`,
`plaintext-only artifact`, `staging/publish`), consistent with
`.agents/wisdom/desktop-packaging.md`.

## 1. Vocabulary and single statement

Clean. Every new term is introduced where it is first needed and reused verbatim
afterwards: `encrypted_db` capability, plaintext-only artifact, `--allow-plaintext`
waiver, SQLCipher capability probe. `docs/editions-and-features.md` §6c was
rewritten from `[parked]` to `[shipped]` and the other three docs
(`backups.md`, `licensing-architecture.md` §5.2.2 + §8.3, `release-verification.md`)
were updated to match, including the honest caveat that only #410 proves a keyed
write. `CONTEXT.md` is a diagnostics/telemetry glossary and this diff does not
touch that area, so there is no glossary conflict — no `CONTEXT.md` entry is owed.

## 2. Deletion test

`apps/desktop/scripts/sqlcipher-availability.mjs` **passes**. Deleting it puts
back exactly the duplication it removed: the fork's loader path
(`build/better_sqlite3.node`, wrongly `build/Release/...` before), the Windows
`libeay32.dll` requirement, the node-gyp decision, and the probe. Leverage is
visible in the diff: `scripts/smoke/installer-smoke.mjs:60` now *imports*
`probeSqlcipherBinding` instead of hand-rolling a second probe, and its header
comment (`:17`) states the same rule the build states — one implementation, two
call sites.

`factory.ts:113` **passes**: `assertBindingEncrypts` takes
`Pick<BetterSqliteDatabase, "pragma"> & { close }`, i.e. an interface *smaller*
than the real Database, so the test fake need not pretend to be one. Deleting it
would spread "plain better-sqlite3 accepts `PRAGMA key` as a no-op" back into
every keyed open.

`runtime-staging.mjs` **passes** (deleting it moves the multi-rename recovery,
ownership and lease logic back into `build-sidecar.mjs`), though its interface is
wide — see §6.

## 3. Finding — the new rule is enforced in one direction only (judgement call, cheap)

The diff introduces one rule and states it for the no-key case:

> `factory.ts:83-87` `assertNotEncryptedWithoutKey` — `if (key …) return` then read
> the leading bytes; refuse when they are not `SQLite format 3\0`.

The mirror case is not covered. With a key set, `assertNotEncryptedWithoutKey`
returns at line 84, so a *plaintext* `SQLite format 3` file opened with
`APP_DB_KEY` present goes straight to the SQLCipher binding; the capability probe
at `factory.ts:152-153` passes (a real fork still reports a `cipher_version`), and
the failure surfaces later as the same opaque `file is not a database` this diff
exists to replace. That is the "licence flipped on for a workspace created
without it" path. `readLeadingBytes` already exists and the header constant is
already there, so enforcing the rule in this direction is ~5 lines and one test —
the kind of cheap cleanup the pass is for. It is judgement, not a blocker: the
keyed path is only reachable with `encrypted_db` on the licence and the binding
is proven real, so this is error-message quality, not a plaintext-at-rest hole.
(Caveat: I could not open a keyed connection against a real SQLCipher fork on
this workstation, so the exact SQLite error text is inferred, not observed.)

## 4. Finding — duplication that will drift: the keyed-open sequence at a second site (judgement call)

`factory.ts:152-153` is now `cipher_compatibility = 4` **plus**
`assertBindingEncrypts`. The backup worker opens the same keyed connection
independently:

> `apps/api/src/modules/backup/backup.snapshot.ts:40` `db.pragma("cipher_compatibility = 4");`
> `apps/api/src/modules/backup/backup.snapshot.ts:131` `options.databaseKey ? "better-sqlite3-sqlcipher" : "better-sqlite3"`

The diff added the invariant "a keyed open proves the binding encrypts" and
applied it at one of the two keyed-open sites. Cheap fix: call
`assertBindingEncrypts` after the keyed open in the snapshot worker. Reachable
only on a waived `--allow-plaintext` artifact, hence judgement, not blocker.
`backup.snapshot.ts` is outside this diff and I read only the two grep lines, so
verify the surrounding code before acting.

## 5. Finding — the waiver matrix is split between a tested pure module and untested closures (judgement call; likely its own issue)

`.agents/wisdom/desktop-packaging.md` ("An escape hatch must cover every failure
mode it exists for") names the matrix — failure mode × waiver — as the thing to
test. After this diff that matrix lives in two places:

- tested, in the pure module: `resolveSqlcipherArtifact` owns "missing binding +
  waived + ephemeral ⇒ skip node-gyp" (covered by
  `sqlcipher-availability.test.mjs`);
- untested, in script-local closures: `build-sidecar.mjs` `enforceSqlcipherGate`
  (missing + not waived ⇒ throw) and `probeStagedRuntime` (unloadable addon +
  waived ⇒ warn and publish; the `console.log` at `:260` is inside it).

The diff adds tests only for `sqlcipher-availability.mjs` and
`runtime-staging.mjs`; `build-sidecar.mjs`'s own gate/probe have no test in this
diff, even though `test:packaging-security` would pick one up
(`node --test ./scripts/*.test.mjs`). Pulling the decision into the pure module,
e.g. `decideSqlcipherOutcome({availability, probeError, plaintextAllowed, ephemeral})
→ {action: "build" | "refuse" | "warn-publish", detail}`, would give that rule
locality and one test surface. Moderate change; if it sprawls, file it separately.

## 6. Notes

- **Interface width (note, own issue).** `buildProbeAndPublishRuntime` /
  `swapRuntimeDirectory` (`runtime-staging.mjs`) take 12–14 injected members
  (rename, remove, exists, readdir, warn, log, now, pid, probeOwner, readMarker,
  writeMarker, markerLeaseMs). Grouping them into one injected
  `{fs, process, clock}` object would shrink a wide interface without losing the
  seam, but it churns ~1100 lines of tests — not this PR.
- **Naming (low).** `assertNotEncryptedWithoutKey` reads as "assert not encrypted
  when there is no key"; it means "refuse a keyless open of a file that is not a
  plaintext database". `refuseKeylessNonPlaintextOpen` would carry the rule with
  no comment. Optional.
- **Repeated prose (low).** The caveat "`cipher_version` is not proof a keyed
  write encrypts" is restated in ~7 places
  (`sqlcipher-availability.mjs:120-131`, `build-sidecar.mjs` `probeStagedRuntime`
  doc, `factory.ts:103-110`, `installer-smoke.mjs:17`,
  `backup.encrypted.test.ts` header, `docs/release-verification.md:27-41`,
  `docs/editions-and-features.md` §6c). `docs/release-verification.md` is the
  natural canonical home; the rest could be one-line pointers to it. Hygiene only
  — the repetition is defensive and correct.
- **Friction created that is acceptable.** `tauri.conf.json`
  `beforeBuildCommand` now re-runs the strict sidecar build, and
  `apps/desktop/package.json` dropped `sidecar:build` from `build`/`tauri:build`,
  so `tauri build` cannot package an unverified runtime; `typecheck` moved to
  `--allow-plaintext --ephemeral`. Both are single-statement and consistent with
  the docs. `@tuari/api` already depends on `better-sqlite3-sqlcipher`
  (`apps/api/package.json:23`) and `tsup.config.ts:10` externalises it, so the
  always-copy/conditional-copy choice in `buildRuntime` matches the bundle.
- **Not verified by me (residual risk).** The doc line references
  `apps/desktop/src-tauri/src/lib.rs:2147` / `has_feature("encrypted_db")` were
  carried in the docs diff and not re-checked against `lib.rs`; and the native
  end-to-end claim still rests on #410, as the diff itself says.

## Verdict

The diff is clean on the merge gate: vocabulary is the project's, each new rule
is stated in one module and consumed elsewhere, no shallow module was added, and
the seams it introduces (pure availability module, `pick`-based capability probe)
are exercised by real adapters. The one substantive design gap is
symmetry — the header rule is enforced keyless→plaintext only (§3) — plus the
duplicated keyed-open at `backup.snapshot.ts` (§4) and the untested half of the
waiver matrix (§5). All three are judgement calls with small fixes; none blocks
merge.
