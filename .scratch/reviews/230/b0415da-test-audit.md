# Test Audit Evidence — Issue #230 (High-assurance tier)

- **Base:** `origin/develop` @ `03ec349643901a2802338d8e19b730b28e5eb841`
- **Head (evidence SHA):** will be refreshed at the final reviewed commit (currently `7106f57` + test-audit fix round)
- **Run:** 3 parallel sub-agents — Edge Case Hunter / Coverage Analyst / Quality Reviewer (`deepseek-v4-flash`)

## Verdict

Quality grade **A** (Quality Reviewer). One BLOCKER found by both the Edge Case
Hunter and the Coverage Analyst — a regression I introduced in the debate fix
round — fixed and re-verified. All remaining findings addressed or dismissed.

## Findings & disposition

| # | Agent | Finding | Severity | Disposition |
|---|---|---|---|---|
| 1 | Edge + Coverage | `callBootstrap` in `tests/e2e/bootstrap-setup-key.spec.ts` still referenced bare `password` after the `7106f57` param removal → `ReferenceError`; whole spec red (serial mode), and E2E is outside typecheck/lint coverage | 🔴 BLOCKER | **Fixed** — restored `password: "password123"`; spec re-run → 3/3 pass. Lesson: E2E specs must be re-run after ANY edit touching them (nothing in the guard pipeline compiles `tests/e2e/`). |
| 2 | Edge | Over-long blank (129 spaces) emitted doubled `too_big` + `custom` issues (short-side analog was fixed) | 🟡 | **Fixed** — length guard extended to the long side (`value.length > 128 ||`); contracts test pins single `too_big` issue. |
| 3 | Edge | "No normalization" guarantee untested — a future `.trim()` on the password path would go unnoticed | 🟡 | **Fixed** — contracts test pins `" password123 "` accepted + round-tripped untrimmed in both schemas. |
| 4 | Edge | Max-length acceptance boundary (128) untested | 🟡 | **Fixed** — contracts test accepts 128-char password in both schemas. |
| 5 | Coverage | Web mapping for the short+blank path (6 spaces → `passwordShort`) unpinned — trickiest new logic | 🟠 | **Fixed** — added to `home-view-auth-utils.test.ts`. |
| 6 | Quality | No accept-test for combining marks alongside visible bases (Mn over-rejection regression would pass CI) | MINOR | **Fixed** — contracts test `"a\u0301b\u0301c\u0301d\u0301"` accepted. |
| 7 | Quality | No Arabic-script password accept-test (ASCII-only tightening would pass CI) | MINOR | **Fixed** — contracts test `"كلمةالمرور123"` accepted. |
| 8 | Quality | Duplicated invisible-password `it.each` arrays between sign-in and bootstrap matrices (drift risk) | NIT | **Fixed** — shared `blankPasswords` const used by both matrices (bootstrap now covers all 9 classes). |
| 9 | Edge | Controller-level test for the whitespace message (optional) | 🟡 | **Dismissed** — the controller is a thin pass-through delegating to `mapCredentialErrors`; the pure-function layer is pinned. Noted in PR. |
| 10 | Coverage | No i18n-resource-key test (`auth.validation.passwordWhitespace` presence in ar.ts) | 🟡 | **Dismissed** — pre-existing absence of i18n-resource tests repo-wide; typed mapping + key-literal assertions cover the wiring. |
| 11 | Coverage | Length boundaries 7/8/128/129 exercised only at the service seam, not directly against `phonePasswordSignInSchema` | INFO | **Dismissed** — shared `passwordSchema`; contract tests now cover 6-space/129-space single-issue + 128 accept directly. |

## Acceptance-criterion coverage (Coverage Analyst)

- AC1 shared schema rejects blank passwords on BOTH schemas → contracts (9-class
  matrix × both schemas) + service (rejection before hash/port) + web (message
  mapping) + E2E (wire 400 + `custom` on `["password"]`). ✅
- AC2 web pre-validation + i18n copy cover the new failure → `passwordWhitespace`
  typed + mapped + Arabic resource + key-literal assertions. ✅
- AC3 unit tests for rejection paths → contracts + bootstrap service. ✅
- AC4 hash unaffected / no normalization → `hash).toHaveBeenCalledWith("pass word 123")`
  + padded round-trip contract test. ✅

## Verification at audit time

- `pnpm test:contracts` → 123 passed
- `vitest run src/modules/auth/bootstrap.service.test.ts src/rpc/router.test.ts` → 74 passed
- `vitest run src/features/app-shell/home-view-auth-utils.test.ts` → 8 passed
- `playwright test tests/e2e/bootstrap-setup-key.spec.ts` → 3 passed (after blocker fix)
