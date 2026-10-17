# Design pass — #402 SQLCipher build/runtime gate (post-rebase)

- issue: #402
- tier: High-assurance (crypto / licensing)
- mode: remote
- branch: `fix/402-encryption-fallback`
- base: `ee366d0d` (current origin/develop)
- reviewed HEAD: `18029346310a4cda7ba24cf4625fcbcb1226b8ca`
- pre-rebase reviewed HEAD: `4444ca13` (evidence superseded by the rebase)
- skills: `domain-modeling`, `codebase-design`, `improve-codebase-architecture` (fresh context)

## Verdict

**Clear: the rebase changed no branch code; the only content delta is the doc-sync
commit. The final HEAD leaves the codebase no worse.**

## Confirmed

- The branch's own code is byte-identical to the reviewed set: every #402 source
  and test file is unchanged across `4444ca13..18029346`, and the rebased commits
  carry the same `git patch-id` as their pre-rebase originals (only the
  conflict-resolved first commit differs, and only in context lines).
- Both intents survive the `docs/release-verification.md` conflict: #402's
  "Fixed in #402" bullet is added; the `cleanup_stale_api_processes` bullet is
  dropped because develop already fixed it in #490; develop's legacy-migration
  gap is kept.
- #403/#490's `lib.rs` work is untouched: `git diff ee366d0d...HEAD -- apps/desktop/src-tauri/`
  lists only `tauri.conf.json`, and no branch commit edits `lib.rs`. The scoped
  `cleanup_stale_api_processes(app: &AppHandle)` and its regression test remain.
- The post-rebase `lib.rs:2228` citations are correct
  (`if manager.has_feature("encrypted_db") {`), and the design record records the
  shift.

## Findings

| Sev | Location | Claim | Action |
| --- | --- | --- | --- |
| Note | `docs/release-verification.md:20` | A past "22/22" smoke run is still recorded next to the sentence that the new checks are pending. | Dismissed: it describes a historical run, not the current check count. |
| Note | `.scratch/reviews/402/` | The pre-rebase `4444ca13` evidence no longer describes an ancestor HEAD. | Superseded and removed; this round's files are the evidence of record. |
| Note | residual | No suite ran inside the read-only review. | The gate's own focused checks (typecheck, lint, desktop packaging, factory/backup vitest) ran outside the review and are green. |
