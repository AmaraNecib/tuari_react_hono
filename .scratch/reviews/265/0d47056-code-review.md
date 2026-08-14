# Code Review — issue #265 (Composition root follow-ups) — final review round

**Head:** `0d47056` (post-evidence delta: Greptile P1 fix round — persister 0600 mode + rekeyed-probe honesty; SHA refreshed from 0105e48)
**Base:** `origin/develop` @ `3c1449043bab7dd28cba4d13b1e072ae1f3999ca`
**Diff:** `git diff origin/develop...HEAD` (23 files, +1960/−220). Commits: `e29c746` (schema threading), `d119bde` (rekey verification + persister), `e08caa2` (shutdown), `7d06b86` (desktop rotation), `705395a` (design doc), `ce66f26` (debate fixes), `d8acada` (final hardening).

Method: fresh-context single reviewer, two axes (Standards / Spec) per the code-review skill. Spec source: issue #265 body + owner guardrail comment (`gh issue view 265`), `.scratch/implementation/265-design.md`. Standards sources: `AGENTS.md`, `docs/engineering-workflow.md`, the ports-and-adapters/ADR conventions in `docs/`, plus the Fowler smell baseline.

---

## Standards

Reported violations are judgement calls unless a documented standard is cited. Verified clean via `eslint` (changed API files) and `tsc --noEmit` (api + web).

1. **JSDoc/comment drift on the ambiguous-failure path** — `apps/web/src/features/app-shell/recovery-key-hooks.ts:96-99` states "the original key remains in the desktop's rollback slot until the app restarts", but `complete_db_key_rotation` clears the slot immediately (`lib.rs:597-600`, called at `hooks.ts:123-128`). A documentation standard issue on a security-critical path: comments must not contradict the code a future reader will trust. **Violation (documentation).**
2. **`apps/api/src/rpc/handlers/system.ts:2-4`** — double blank line after the import block. Cosmetic; the repo's eslint config does not flag it (lint is clean), so it is a judgement-call nit, not a hard violation.
3. **Ports-and-adapters discipline (documented convention in `docs/architecture-decisions.md` + the #198 design):** maintained. `DatabaseKeyManager`/`DatabaseKeyPersister` are narrow, storage-agnostic ports; all SQLite/SQLCipher mechanics stay in the adapter (`database-key-manager.ts`); the raw handle never leaves the composition root; result types mirror the wire shape. ✓
4. **Smell baseline scan of the diff:**
   - *Duplicated Code:* none new — both PRAGMA-escaping sites share the pre-existing `escapeSqliteString` (`factory.ts`).
   - *Primitive Obsession:* none — the discriminated `DatabaseKeyChangeResult` / wire `changeDbKeyOutputSchema` are proper types; `rekeyed` is a boolean flag on a discriminated union, not a stringly-typed state.
   - *Shotgun Surgery:* the persister wiring touches `dependencies.ts` / `router.ts` / `system.ts` / `contracts` — one logical change, acceptably scoped (a single new port threaded through the existing dependency chain).
   - *Middle Man / Speculative Generality:* `DatabaseKeyManagerSeams` is justified (test injection); the one-line `run*` wrappers in `schema.ts` are pre-existing patterns, unchanged in kind.
   - *Mysterious Name / Feature Envy / Data Clumps / Repeated Switches / Message Chains / Refused Bequest / Divergent Change:* none observed in the diff.
5. **Naming & structure:** clear throughout; the three Rust commands mirror the three web orchestration outcomes (rotate/restore/complete) — a good seam for testability (`lib.rs:565-599`).

**Standards verdict:** pass, with one documentation violation (#1, should-fix) and one cosmetic nit (#2).

## Spec

Spec = issue #265 body (three items) + the owner's four guardrails + `265-design.md`.

1. **Item 1 — persist the new key after rekey:** delivered. `system.ts:86-104` persists after a successful rekey and surfaces persist failure honestly with `rekeyed: true`; `loader.ts` merges `db_key` into `APP_DB_KEY` when env is unset; the desktop rotates the keyring first (guardrail 1). **Deviation (must-fix):** the design intent ("this persister covers file-driven deployments; the desktop uses the OS keyring") is not honored — on the desktop `TUARI_CONFIG_FILE` is set unconditionally (`lib.rs:1958-1965`), so the persister writes the key in plaintext to `config.json` even though env `APP_DB_KEY` wins and the config value is never read. See debate finding #1.
2. **Guardrail 1 — Rust shell owns rotation, atomically rotate before rekeying:** implemented (`rotate_db_key` writes the store then remembers `previous`; web calls it before the RPC; `hooks.ts:102-107`). ✓
3. **Guardrail 2 — verify the current key on a fresh connection:** implemented, both before the rekey (`manager.ts:169-172`) and after (`manager.ts:193-198`), scratch connection always closed. ✓
4. **Guardrail 3 — fail explicitly when the DB is currently unencrypted:** implemented via a bounded 16-byte header read (`manager.ts:71-96` → "Database is not encrypted", `manager.ts:165`). ✓
5. **Guardrail 4 — keep the discriminated `DatabaseKeyChangeResult`:** kept and extended with `rekeyed`; contracts tests reject the invalid combos. ✓
6. **Item 2 — graceful shutdown:** delivered (`shutdown.ts` + `index.ts`): SIGINT/SIGTERM, stop → close → exit, idempotency, force-exit guard, injectable exit. Matches the design doc §6. ✓
7. **Item 3 — remove the schema executor global:** delivered (`schema.ts`): module global deleted, `db` threaded through every helper, exported `apply*` signatures unchanged, no global state remains (`grep` for `getExecutor`/`_executor`/`globalThis` in schema.ts: none). ✓
8. **Scope creep:** none of concern — `complete_db_key_rotation` and the `rekeyed` wire flag are additions from the debate round that close real gaps (rollback-on-ambiguous-failure, post-rekey honesty), not speculative generality.
9. **#234 preservation (rebase check):** both behaviors coexist in the shared files — the Cf-rejection `keyFieldSchema` input schema is untouched in `packages/contracts/src/security.ts`, and the ZWSP rejection tests survive in `router.test.ts:963-978` alongside the new `rekeyed` tests; the full API suite (1099) and contracts suite (131) pass together. ✓
10. **Design deviations:** (a) `db_key` dropped `.min(8)` (`loader.ts:27` vs design §3.1) — should-fix; (b) design §9 step 3 ("restore on RPC failure") was refined to restore-only-on-definitive-failure — an improvement, documented in code; (c) the desktop-plaintext persister issue (1 above) is a deviation from the design *intent*.

**Spec verdict:** all three issue items and all four guardrails are implemented; one deviation violates the design intent (desktop plaintext persister — must-fix); two smaller deviations (db_key min, refined restore semantics).

## Summary

- **Standards axis:** 1 finding (documentation violation on `recovery-key-hooks.ts:96-99` — should-fix) + 1 nit (blank line). Worst issue: the misleading comment on the ambiguous-failure path.
- **Spec axis:** 3 findings — 1 must-fix deviation (desktop plaintext key in `config.json`, `dependencies.ts:224-226`), 1 should-fix deviation (`db_key` min length dropped), 1 documented improvement (restore-only-on-definitive-failure). Worst issue: the must-fix desktop persister deviation (see debate #1).

---

## Post-evidence delta (fix loop, SHA `0105e489`)

This review ran against `d8acada`; the fix loop landed as commit `0105e489`
and resolves every open finding:

- **Must-fix deviation (desktop plaintext key in `config.json`) — FIXED.**
  `dependencies.ts` now passes a null persister path when `APP_DB_KEY` is
  set, so env-pinned (desktop) deployments never write a plaintext config
  copy — the config `db_key` would be unread anyway (env wins in
  `mergeConfigIntoEnv`). Design intent restored: the persister covers
  file-driven deployments only.
- **Should-fix (`db_key` min length dropped) — FIXED.** `loader.ts` restores
  `db_key: z.string().min(8).optional()`, matching the design doc §3.1 and
  the wire schema; the loader test pins the rejection of a short key.
- **Standards finding #1 (misleading comment at `recovery-key-hooks.ts:96`) —
  FIXED.** The doc now states the original key is intentionally dropped when
  the rotation is acknowledged (slot cleared), not "retained until restart".
- **New from the fix loop:** post-rekey verification now discriminates via an
  old-key probe (`rekeyed: true` when neither key opens the DB), the
  restore-slot write is ordered before the clear, the force-exit guard covers
  `close()`, and the persister validates its output against the loader schema
  and cleans up its tmp file on failure — each pinned by tests (see the
  test-audit delta).
- **Unchanged:** ports-and-adapters discipline, guardrail 1–4 compliance,
  schema-executor threading, and the #234 coexistence all re-verified green
  (API 1109/1109, contracts 131/131, web 484/484, Rust 105/105, clippy
  `--lib` clean).

**Still open (documented):** debate #5 (real-SQLCipher-binding WAL rekey
smoke test — binding absent in this workspace; landing-lane prerequisite) and
#8 (in-memory rollback slot crash window — follow-up).

---

## Post-evidence delta — Greptile P1 fix round (SHA refreshed 0105e48 → 0d47056)

This round addresses the two Greptile P1 findings on PR #347; evidence files
renamed to the final code SHA per `process.md` (post-evidence delta note).

- **F1 (security):** `database-key-persister.ts` — the key-bearing tmp file
  is now opened with an explicit `0o600` mode (`KEY_FILE_MODE`, mirroring the
  desktop secret-file writer) so a permissive umask cannot widen the
  replacement file's permissions before the atomic rename. Test asserts 0600
  on the renamed config (skipped on Windows where modes are meaningless).
- **F2 (correctness):** `database-key-manager.ts` — post-rekey probes now
  return a tri-state (`opens` / `wrong-key` / `error`); `error` (transient/
  system) is never treated as evidence. A post-rekey probe that could not
  VERIFY the new key — definitive `SQLITE_NOTADB` rejection OR transient
  failure — reports `rekeyed: false` (ambiguous; caller keeps the old-key
  rollback slot, no rotation acknowledged) instead of the old
  `rekeyed: !currentKeyStillOpens` inference that claimed `rekeyed: true`
  when both probes failed. The old-key discrimination probe was removed (its
  only consumer was the now-removed inference). Tests: transient
  both-probes-fail path asserts `rekeyed: false`; definitive-rejection path
  asserts `rekeyed: false`; stale comments in `system.ts` and
  `router.test.ts` updated to the corrected contract.

Re-verified on 0d47056: `pnpm typecheck` (4/4 tasks), `pnpm test:api`
(65 files, 1109 passed | 1 skipped), `pnpm test:web` (59 files, 484
passed). No Rust touched in this round.
