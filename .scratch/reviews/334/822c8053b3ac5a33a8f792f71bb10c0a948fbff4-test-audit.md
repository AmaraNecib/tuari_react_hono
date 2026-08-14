# Test Audit — Issue #334 (keyFieldSchema widening)

**Head SHA**: `5643afd663da23fb40b436cd5e82ab6c65951542`
**Base SHA**: `6a678c0`
**Tier**: High-assurance (security)

Three parallel sub-agents (edge-case hunter, coverage analyst, quality
reviewer) audited `git diff 6a678c0...HEAD` against the issue spec and the
design doc (`.scratch/implementation/334-design.md`).

## Verdict summary

**Quality grade: A** (three-layer coverage — contract / wire / E2E; meaningful
assertions; comment claims pinned; regression-safe in both directions).

## Pre-fix findings (all addressed in HEAD)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | 🟠 | U+1160 Hangul filler (in the regex) had zero test coverage — a regex typo could drop it silently | FIXED: 8× U+1160 rejection pinned; all four fillers (U+115F/U+1160/U+3164/U+FFA0) now tested |
| 2 | 🟠 | min(8) 7+1 length-deferral interplay unpinned for the NEW classes (#234 pinned it only for Cf) | FIXED: new "defers to min() for too-short values of the widened classes" test — `abcde12\u2800` (len 8, reaches refine) vs `abcde1\u2800` (len 7, single too_small); Mn deferral pinned too |
| 3 | 🟡 | Carve-out boundaries U+0008/U+0009 and U+000D/U+000E untested | FIXED: U+0008 ×8 rejected (last C0 below carve-out), embedded U+000E rejected (first C0 above) |
| 4 | 🟡 | VT (U+000B)/FF (U+000C) carve-out members accepted but unpinned | FIXED: both accepted-members pinned in the carve-out test |
| 5 | 🟡 | C1 range U+0080–U+009F claimed rejected, only U+007F pinned | FIXED: U+0080/U+009F ×8 rejected pinned |
| 6 | 🟡 | Astral-plane Mn (surrogate-pair length-guard gaming, #234 analog for Cf) untested | FIXED: 4× U+1D167 = UTF-16 length 8 → rejected pinned |
| 7 | 🟡 | Zp (U+2029) deliberate allowance unpinned (only Zl U+2028) | FIXED: U+2029 accepted pinned |
| 8 | 🟡 | Additional Zs members (U+3000 ideographic space) untested | FIXED: U+3000 rejected pinned |
| 9 | 🟡 | No Mc over-reach pin — broadening `\p{Mn}` → `\p{M}` would pass silently | FIXED: visible spacing mark U+0903 accepted pinned |
| 10 | 🟡 | Hangul fillers lacked wire-level coverage (mitigated by shared schema) | FIXED: U+3164 ×8 → BAD_REQUEST wire case added |
| 11 | 🟡 | Wire/E2E seam: revokeRecoveryKey.keyId with new classes; wire acceptance path; E2E Cc-at-min(8) | NOT FIXED (documented): contract seam is the authoritative unit seam for the pure-schema class list; wire/E2E prove the gate fires per class (consume + changeDbEncryptionKey). keyId is a server-issued opaque ID (defense in depth only). |

## Auditor-verified correct behavior (no action)

- All four issue bypasses covered at all three seams: U+2800, Mn, Cc,
  mid-string NBSP.
- Standalone + embedded semantics pinned for representative members.
- #221 internal-newline pin green (LF + tab/CR/CRLF + U+2028/U+2029 accepted).
- min(8) PRAGMA hazard reached per class (8× of each rejected class throws).
- Single-issue deferral + astral Cf length-guard pinned from #234 (retained).
- No over-reach: © (So), CJK (Lo), Mc spacing marks accepted.
- Empirical regex verification (node, exact production regex): every
  carve-out boundary behaves per design; astral Mn rejected; Mc NOT rejected.

## Evidence

- Agent runs: `e6b41953-600c-4722-a3bc-ddfef43f966c` (hunter, coverage, quality).
- Local runs at HEAD: contracts 160/160, API 1170 passed | 1 skipped, web
  494/494, full Playwright suite 42/42 (previous HEAD — e2e spec unchanged
  since; wire additions covered by router seam).

---
post-evidence delta: evidence rename + wisdom commit (docs-only, no code change). Review content remains valid.
