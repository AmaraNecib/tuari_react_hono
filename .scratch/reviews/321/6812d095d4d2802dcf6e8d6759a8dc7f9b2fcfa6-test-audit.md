# Test Audit Evidence — Issue #321 (High-assurance tier)

- **Base:** `origin/develop` @ `3c14490`
- **Head (evidence SHA):** `6812d095d4d2802dcf6e8d6759a8dc7f9b2fcfa6`
- **Audit scope:** test files changed by the diff, their corresponding source
  files, and the E2E spec + seed helper. Three lenses: edge-case hunter,
  coverage analyst, quality reviewer.
- **Verification performed:** all changed unit/integration suites run green
  (contracts 142, web 17, API auth 4); the E2E spec was executed live and
  **passed** (38s).

## Overall grade: A−

Strong coverage of every critical check with meaningful, non-vacuous assertions;
the only material gap is that the settings-section **form-level** path is
covered by the E2E alone (no unit test drives `handleSave`), plus a latent
pnpm-store resolution fragility in the E2E seed helper.

## Agent 1 — Edge Case Hunter

| # | Missing / weak edge case | Risk | Where it could break | Suggested pin |
|---|---|---|---|---|
| 1 | settings-section.tsx:205-236 form logic (whitespace current password → `hasPasswordChange` true; `currentPassword.length` required-checks; untrimmed passthrough at :236) has **no unit test** — the mock-dashboard tests call `mutateAsync` directly, bypassing `handleSave` | 🟠 subtle | A future refactor of the form could trim or drop the current password again without any unit catching it; only the E2E would notice | Add a renderHook/component test that fills the real form with `"        "` current password and asserts the mutation receives it untrimmed, and that a spaces-only current password + empty new password shows `accountPasswordNewRequired` |
| 2 | `loadBetterAuthRequire` (db-seed.ts:176-184) resolves by `readdirSync(pnpmDir).find(dir => dir.startsWith("better-auth@"))` — the pnpm virtual store currently contains **two** better-auth versions (`1.6.20` and `1.6.2`); `.find()` is directory-order dependent | 🟠 subtle | A store layout change (new transitive dep, pnpm version bump) could resolve `1.6.2` → different/default scrypt params → the seeded hash fails verification → flaky E2E. Verified to resolve `1.6.20` today (live check + passing E2E) | Pin the entry to the version `apps/api` actually resolves (read from its lockfile/workspace resolution) instead of first-prefix match |
| 3 | No E2E coverage for the **desktop** sign-in bridge with a legacy password (web only) | 🟡 cosmetic | Rust bridge is gated by the same web mutation parse (verified by design); if the bridge ever bypasses the parse, the recovery path silently changes | Out of scope for this lane; note in PR |
| 4 | E2E DB discovery (`findE2eDatabase`) picks "newest integration DB by mtime" | 🟡 cosmetic | Safe under `workers: 1` (one DB per run, verified in playwright.config.ts); a stale DB from a crashed prior run could be picked if the current server failed to create one — mitigated by the throw-if-absent guard | Acceptable; note only |

Covered edge cases (verified present, no action): empty vs short vs blank
password split; ZWSP/tabs/NBSP/control/mixed all-invisible classes in both
matrices; 6-space → single `too_small` and 129-space → single `too_big` for
**both** schemas; padded password round-trips untrimmed; internal spaces +
diacritics/Arabic accepted; max-length accepted; wrong-whitespace-value rejected
against a real hash (API test); whitespace-only new password rejected without
dispatching (mutation test); ZWSP-only bootstrap password still shows
`passwordWhitespace`.

## Agent 2 — Coverage Analyst

1. **Does each acceptance criterion have a test?** Yes, all four critical
   criteria:
   - **#230 intact for NEW inputs:** contracts matrix (bootstrap rejects every
     all-invisible class, index.test.ts); `mapBootstrapErrors` ZWSP pin;
     bootstrap wire gate untouched (bootstrap.service.ts unchanged, existing
     tests still green); mutation rejects whitespace-only new password without
     calling `changeCurrentPassword`.
   - **Recovery is non-destructive / hash-verification only:** API integration
     test (`auth.test.ts`) seeds a real better-auth hash of 8 spaces and pins
     sign-in success + wrong-value rejection; web mutation test pins the
     8-space password is dispatched untrimmed; settings mutation test pins the
     current password passes through untrimmed.
   - **Rejected options not implemented:** OTP `sendOTP` hard-throw is
     pre-existing and asserted by design (no new code); nothing in the diff
     adds a reset/OTP primitive.
   - **E2E meaningful:** live-passing full lifecycle (sign-in → rotate →
     re-sign-in → legacy rejected) gated on the change-password response status.
2. **Diverse or same-pattern?** Diverse: schema matrices (contracts), pure
   functions (map*Errors), mutation dispatch tests, an in-memory DB integration
   test, and a seeded E2E. Not same-pattern.
3. **Duplicate coverage?** Minimal, benign: the two new mock-dashboard tests
   share wrapper boilerplate (could be a `renderSettingsMutation` helper);
   the ZWSP bootstrap `mapBootstrapErrors` pin overlaps conceptually with the
   contracts matrix but pins a different layer (copy key vs schema issue).
4. **What's missing?** The settings-section form-level path (see edge #1);
   a direct unit pin that `mapBootstrapErrors` does NOT overwrite a valid
   password error when only the name is invalid (covered transitively by the
   existing "keeps the required name error alongside a valid password" test —
   acceptable).

## Agent 3 — Quality Reviewer

Grade: **A**

- Test names are descriptive and behavior-focused ("no longer blocks a
  spaces-only sign-in password (legacy recovery)", "still rejects a
  whitespace-only new password (#230)").
- Rationale comments on every behavior-changing test cite the issue and the
  creation-vs-verification distinction — future readers can reconstruct intent.
- Async handling correct: `await act(async () => … mutateAsync …)`, awaited
  `saveResponse` before the toast assertion, proper `expect(...).rejects`.
- Isolation: each web test builds its own QueryClient/wrapper; the E2E uses
  `describe.configure({ mode: "serial", retries: 0 })` with a documented reason
  (state-mutating spec on a shared per-run DB) — mirrors `admin-account.spec.ts`.
- Assertion quality: the E2E asserts the change-password HTTP 200 **before**
  the toast, and the final negative case asserts the actual error toast, so the
  spec cannot pass vacuously (confirmed by a live run: the legacy-password
  failure step produces the expected toast while the server logs the expected
  "Invalid password" for that step).
- No missing awaits, no setup duplication beyond the benign wrapper boilerplate
  noted above.

## Residual risks

- The change-password **new-password** policy gap (ZWSP-only values) is not
  test-covered because it is not implemented (see debate finding #2 — pre-existing
  #230 hole, out of #321 scope; recommended follow-up issue + a test when fixed).
- E2E robustness depends on the pnpm-store prefix resolution for `better-auth`
  (edge #2); verified working today.

---

## Post-evidence delta (fix loop → `4acc091`)

- **New HEAD:** `4acc09134df13aeb9eff23ed41d097be587fc477`.
- **No test changes in the delta** — the fix is comment/doc text only
  (`packages/contracts/src/auth.ts` JSDoc, `docs/auth-recovery.md`), so all
  audited coverage still stands at `5c6f8a4` behavior. The `\p{Cf}`-only
  change-password gap (residual risk) remains intentionally UNCOVERED: it is
  not implemented, out of #321 scope, and recommended as a follow-up issue
  (add a test when the policy gate lands).
- **Audit edge #1 (settings-section form-level unit test)** — deliberately not
  added: fix-loop scope was the two findings only ("No other changes needed").
- **Audit edge #2 (`loadBetterAuthRequire` version-prefix fragility)** —
  unchanged; resolves to `better-auth@1.6.20` today, pinned by a passing E2E.
- **Re-validation:** `pnpm typecheck` exit 0 (4/4); `pnpm test:api` exit 0
  (63 files, 1070 tests); `pnpm test:web` exit 0 (58 files, 480 tests).

---

## Post-evidence delta (fix loop → `6812d09`)

- **New HEAD:** `6812d095d4d2802dcf6e8d6759a8dc7f9b2fcfa6` (rounds 2–3 below).
- **Round 2 — E2E bootstrap-owner staging (`b59404d`, fix(e2e)):** the CI
  failure was a *staging* bug in the E2E seed/spec, not a test-coverage gap. In
  the shared per-run DB an earlier spec had bootstrapped the workspace, so the
  seeded legacy user (a second user) failed the owner-gated `workspaceSnapshot`
  after sign-in and the dashboard never rendered. `seedLegacyPasswordUser` now
  stages the legacy user AS the bootstrap owner — records + re-points the
  `app_bootstrap_state` singleton, returns a `restoreOwner` handle the spec
  calls in `afterAll`. This adds a new executable edge: the seed's owner
  handoff + restore is exercised live by the full suite (handoff path in-suite,
  create+delete path in the two isolated runs). Audit edges #1/#2 from the
  original run are unchanged.
- **Round 3 — docs policy-scope correction (`6812d09`, docs(auth)):** doc-text
  only; no test changes, all audited coverage still stands.
- **Re-validation:** full E2E suite green twice (40 passed / 2 skipped, legacy
  spec [26/42], zero `UNAUTHORIZED` owner-gate errors in the server log);
  legacy spec green twice in isolation (1/1 each); `pnpm typecheck` 4/4;
  `pnpm test:api` 63 files / 1070 tests; `pnpm test:web` 58 files / 480 tests;
  all six hygiene checks exit 0.
