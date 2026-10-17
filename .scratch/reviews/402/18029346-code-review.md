# Code review — #402 SQLCipher build/runtime gate (post-rebase)

- issue: #402 — *build-sidecar silently ships without SQLCipher while APP_DB_KEY
  is set (encrypted_db licenses get a plain DB)*
- tier: High-assurance (crypto / licensing)
- mode: remote
- branch: `fix/402-encryption-fallback`
- base: `ee366d0d` (current origin/develop)
- reviewed HEAD: `18029346310a4cda7ba24cf4625fcbcb1226b8ca`
- skill: `code-review` (Spec + Standards), fresh context

## Spec verdict — PASS

| Requirement | Evidence | Status |
| --- | --- | --- |
| Never exit 0 with an `encrypted_db` license and no SQLCipher | `build-sidecar.mjs` `enforceSqlcipherGate` throws inside the build callback before publish; `isReleaseBuild` refuses the waiver in CI/production | Met |
| Refuse at runtime rather than claim encryption | `factory.ts` requires a non-empty `PRAGMA cipher_version` and closes the handle; the two-way header rule refuses the downgrade cases | Met |
| Artifact proof | `installer-smoke.mjs:628,645` checks the fork's loader path and loads it with the bundled Node | Met |
| Gate wiring survives the rebase | `apps/desktop/package.json` keeps `sidecar:build` (strict) and `test:packaging-security`; `tauri.conf.json:10` `beforeBuildCommand` appends `&& pnpm --filter @tuari/desktop sidecar:build` | Met |

## Standards verdict — PASS

- The `docs/release-verification.md` conflict kept both intents: #402's fixed-gap
  bullet is present; the `cleanup_stale_api_processes` bullet was already removed
  by develop in #490, so dropping it avoids a revert; develop's migration gap
  stays.
- `lib.rs` citations are correct at the new base: `has_feature("encrypted_db")`
  is at `lib.rs:2228`, matching `docs/editions-and-features.md:195,273` and the
  design record. The branch never edits `lib.rs`.
- `scripts/smoke/installer-smoke.mjs` merged coherently (`node --check` passes;
  imports the real `probeSqlcipherBinding`; the plain-binding, fork-present, and
  fork-loads checks coexist).
- Release-proof invariants intact: `sqlcipherPlaintextWaiver` is the one rule;
  `isReleaseBuild` fails closed; the probe has a 30 s bound.

## Findings

| Sev | Location | Claim | Disposition |
| --- | --- | --- | --- |
| Note | `docs/release-verification.md:20,330` | "22/22 checks" remains while the #402 checks are pending. | Dismissed: it records a past run; the adjacent sentence says the new checks are pending. |
| Note | `docs/editions-and-features.md:30,52,92,108,130` | Older `lib.rs` citations (`:853`, `:1049`, `:2026`, `:2052`) do not point at the described code in the rebased file. | Outside this diff's edit set — develop's own stale pins, not #402's. |
| Note | `.scratch/implementation/402-design.md:289` | The round-4 changelog keeps "Corrected to `2148`" next to the post-rebase 2228. | Reads as history; the rebase section explains the shift. |

Blocker: none. Residual risks are the documented deferrals (#410, `portable:only`,
inspection-only `build-sidecar.mjs` wiring).
