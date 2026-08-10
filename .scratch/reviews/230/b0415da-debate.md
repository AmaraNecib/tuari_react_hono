# Debate Evidence — Issue #230 (High-assurance tier)

- **Base:** `origin/develop` @ `03ec349643901a2802338d8e19b730b28e5eb841`
- **Head (evidence SHA):** `7106f57` — includes the debate fix round (`4741502` + `7106f57`)
- **Run:** two parallel sub-agents (critic `deepseek-v4-flash` / defender `deepseek-v4-flash`)

## Verdict

No blocker (8–10) findings on the final head. The implementation matches the issue
spec exactly. All actionable minors were fixed in the `7106f57` round; the one Major
is an accepted, issue-mandated tradeoff tracked as a follow-up issue.

## Synthesis / disposition

| # | Finding (critic) | Score | Disposition |
|---|---|---|---|
| 1 | Legacy whitespace-password user cannot sign in through the app UI; no recovery path (OTP disabled #283, settings change requires current password) | 4 | **Deferred → follow-up issue #321** (recovery path). Accepted tradeoff mandated by the issue itself; greenfield-only impact; documented in design doc Risks + PR body. |
| 2 | `\p{Mn}` (combining marks / variation selectors) pass the visible-char class — blank-looking but accepted | 2 | **Fixed** — added `\p{Mn}` to the exclusion class (`auth.ts`). |
| 3 | Dead `password` param on `callBootstrap` E2E helper | 2 | **Fixed** — dropped the param (`bootstrap-setup-key.spec.ts`). |
| 4 | Design doc said E2E asserts envelope `VALIDATION`; implementation proves wire `BAD_REQUEST` | 2 | **Fixed** — design doc updated to the implemented behavior. |
| 5 | Short+blank password (6 spaces) emits doubled `too_small` + `custom` issues → two `fieldErrors` entries | 2 | **Fixed** — refine length guard (`value.length < 8 ||`) defers to `.min(8)` for every too-short value; single issue (asserted in contracts tests). |
| 6 | Web blank-password detection keys on any `custom` password issue — hypothetical future second refine would mislabel | 1 | **Dismissed** — the service's field Record forces a decision when a refine is added; the web check is unambiguous today (single refine). Noted in PR. |
| 7 | Arabic copy "spaces only" narrower than the rule (also tabs/NBSP/ZWSP/control) | 1 | **Fixed** — reworded to "أحرف غير مرئية" (invisible characters) in web + service, kept consistent. |
| 8 | English refine message surfaces in raw ORPC error bodies | 1 | **Dismissed** — developer-facing only; consistent with the existing name refine; web + service both map to Arabic copy. |

## Defender highlights (agreed)

- `.refine()` over `.regex()` is the correct seam — `custom` routes through
  `BOOTSTRAP_FIELD_CUSTOM_MESSAGE`; `.regex()` would have produced the misleading
  "must not exceed 128 chars" Arabic copy.
- No password normalization — hash computed over exactly what the user typed.
- Internal spaces preserved (NIST 800-63B); only all-invisible values rejected.
- Shared `passwordSchema` keeps sign-in/bootstrap consistent (issue requirement).
- Web test asserts i18n key literals via identity `t()` — non-tautological.
- E2E deterministically discriminates the actual rule (400 + `custom` on password).

## Critic report (full)

_Scope: `git diff 03ec3496...HEAD` (10 files), issue #230 body, design doc, live
verification of zod behavior / regex classes / sign-in + wire gate._

- `.refine()` > `.regex()`: emits `custom` → routed by the service Record the comment
  anticipated. `.regex()` would emit `invalid_string` → misleading "must not exceed
  128 chars" copy.
- No normalization: hash computed over exactly what the user typed; existing hashes
  untouched; normal-password sign-ins unaffected.
- Empty-string guard verified: `""` → single `too_small`; 6 spaces → `too_small` +
  `custom` (now fixed to single `too_small`); 8 spaces → single `custom`.
- Shared `passwordSchema` prevents policy drift (explicit issue requirement).
- Internal spaces allowed (NIST 800-63B) — verified `"pass word 123"` at every layer.
- E2E DB-state deterministic; proved the gate returns HTTP 400 with the exact
  `custom` issue on `password`.
- No scope widening: settings change-password already trims → rejects whitespace-only
  new passwords; server-side better-auth sign-in intentionally unchanged.

## Defender report (full)

- D1 Shared `passwordSchema` const — single source of truth, mirrors `algerianPhoneSchema` pattern (10).
- D2 `.refine()` over `.regex()` — the seam the service comment anticipated (10).
- D3 NO trim/normalization — hash byte-identical to input (10).
- D4 Visible-char class `[^\p{Cc}\p{Cf}\p{Z}]` (now `+ \p{Mn}`) — naive `/\S/` misses
  ZWSP; empirically verified all invisible classes rejected, Arabic/emoji/spaced pass (9).
- D5 Internal spaces preserved — NIST 800-63B §5.1.1.2 (10).
- D6 Length/empty guard defers to `.min(8)` — single issue; same pattern as name refine (10).
- D7 Web pre-validation distinguishes `custom` from `too_small` — accurate message (10).
- D8 i18n type-safe + complete; web + service Arabic messages match (9).
- D9 Bootstrap service copy + comments updated; Record forces compile-time decision (10).
- D10 Settings change-password already rejects whitespace-only new passwords (8).
- D11 Desktop sign-in path gated too — schema.parse runs before the desktop branch (9).
- D12 E2E asserts 400 + `custom` on `["password"]` — strongest assertion; deterministic (9).
- D13 Non-tautological assertions — identity `t()`, independent literals, hash/port not called (10).
- D14 Existing-user consideration honored — issue's own trade-off (7).
- D15 Design doc complete decision record (minor doc drift fixed in `7106f57`) (9).

## Post-evidence delta (evidence refreshed to b0415da)

Evidence originally captured at `7106f57`; the `b0415da` test-audit fix round
touched only: the long-side length guard in `passwordSchema`, contract/web test
pins (no-normalization, 128-boundary, Mn+Arabic accepts, shared blankPasswords
matrix), a web short+blank pin, the E2E helper regression fix, and Arabic copy
reword — all reviewed by the test-audit (b0415da-test-audit.md). No debate
finding's disposition changed.
