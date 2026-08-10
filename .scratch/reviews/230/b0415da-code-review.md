# Code Review Evidence — Issue #230 (pre-push self-review)

- **Fixed point:** `origin/develop` merge-base @ `03ec349643901a2802338d8e19b730b28e5eb841`
- **Head (evidence SHA):** `b0415da`
- **Run:** two parallel sub-agents — Standards / Spec (`deepseek-v4-flash`)

## Verdict

**No actionable findings on either axis.** Standards: no hard violations of
documented standards; only low-severity judgement calls that all match
pre-existing repo conventions. Spec: PASS — no missing requirements, no scope
creep, no wrong implementations.

## Standards report (verbatim summary)

- Hard violations: **none.** AGENTS.md staging discipline held (playwright-report/
  noise restored, not committed); engineering-workflow.md test seams satisfied
  (contracts + api service + web pure-functions + Playwright E2E); design doc
  committed; per-file style consistent.
- Judgement calls (low, consistent with existing patterns):
  1. Duplicated 8/128 bounds in `auth.ts` — deliberate, documented (defers to a
     single length issue, mirrors the name refine's guard).
  2. Arabic blank-password message duplicated web/service — the repo's established
     defense-in-depth copy pattern; strings match exactly.
  3. `issue.code === "custom"` discriminator in two layers — inherent to zod's
     issue taxonomy; not a harmful cascade.
  4. Shotgun Surgery (inherent) — one logical change touches 5 source files; the
     issue itself documents this blast radius as why #226 deferred it; typed
     `HomeViewCopy` + field-keyed `Record` force completeness at compile time.
- Nits: `home-view-auth-utils.ts` scans `issues` twice (cosmetic; readable).
- Strengths noted: `isBlankPassword` discriminator routes only the refine's
  `custom` issue; explicit no-normalization posture documented + tested; stale
  doc-comments updated in the same change (no comment rot); shared `blankPasswords`
  matrix keeps the test sets from drifting.

## Spec report (verbatim summary)

- (a) Missing: **none.** All "What to build" requirements implemented. One
  consideration partial (per-spec): legacy whitespace-password users are blocked at
  the web pre-gate because the issue mandated the rule on the sign-in schema —
  "hash unaffected" holds; tradeoff documented in design doc + tracked in #321.
- (b) Scope creep: **none.** Settings change-password correctly untouched (already
  trims); extra invisible classes fall within the issue's "arguably non-printable".
- (c) Implemented but wrong?: **none.** `.refine()` over `.regex(/\S/)` — equivalent
  or stricter, emits `custom` routed correctly by the service Record. `min(1) after
  trimming` deliberately NOT used — trimming would alter hashing semantics and break
  existing hashes; correct deviation, documented. New `passwordWhitespace` key rather
  than reusing `passwordShort` — aligned with intent (reuse would be misleading for
  an 8-space password). Web discriminator sound (length guard ⇒ `custom` fires only
  for length-valid all-invisible values).
