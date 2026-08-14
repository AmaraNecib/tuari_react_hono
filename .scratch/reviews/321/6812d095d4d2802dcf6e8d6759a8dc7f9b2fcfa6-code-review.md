# Code Review Evidence — Issue #321 (High-assurance tier)

- **Fixed point (base):** `origin/develop` @ `3c14490`
- **Head (evidence SHA):** `6812d095d4d2802dcf6e8d6759a8dc7f9b2fcfa6`
- **Diff:** `git diff 3c14490...5c6f8a4` — 13 files, +641/−18 (one commit:
  `5c6f8a4 feat(auth): legacy whitespace-password sign-in recovery path (part of #321)`)
- **Spec source:** `.scratch/implementation/321-design.md` + issue #321 body
  (recovery for pre-#230 whitespace-password users) + #230 history.
- **Standards sources:** repo conventions (AGENTS.md, engineering workflow),
  existing code patterns in the changed modules, Fowler smell baseline.
- **Verification:** `eslint` clean on all changed web/API files; `tsc --noEmit`
  clean on contracts, web, and API; all changed unit/integration suites green;
  E2E spec passes live.

---

## Standards

**No violations.** No documented-standard breaches; no actionable Fowler smells.

- **Style/lint/type:** eslint and tsc clean across all three packages. The one
  long line (home-view-auth-utils.ts:58, 116 chars) matches the repo norm
  (settings-section.tsx carries pre-existing 200+ char lines); no prettier in
  the repo, so no formatting gate exists.
- **Duplicated Code:** the `min(8).max(128)` bounds are restated in
  `signInPasswordSchema` (auth.ts:46) — judged a deliberate, documented split
  along the creation/verification boundary, pinned together by the contracts
  test matrices; not actionable duplication.
- **Shotgun Surgery:** none — the change is localized to the auth boundary
  (contracts schema, sign-in form utils, account-settings mutation/form) plus
  its tests and docs.
- **Speculative Generality:** none — `signInPasswordSchema` is exported and used
  immediately; no unused hooks or parameters.
- **Mysterious Name / Feature Envy / Data Clumps / Repeated Switches / Message
  Chains / Middle Man / Refused Bequest / Divergent Change:** not present.
- The `mapBootstrapErrors` strict re-check (home-view-auth-utils.ts:53-63)
  reuses the already-computed `authBootstrapInputSchema` result — no double
  parse, no new coupling.

## Spec

**Faithful to the design doc; no scope creep.** One documentation-accuracy drift.

| Design-doc requirement | Status |
|---|---|
| Split schema: strict `passwordSchema` stays on bootstrap; add lenient `signInPasswordSchema` for sign-in | ✅ auth.ts:8-46; `phonePasswordSignInSchema` uses the lenient schema (:50) |
| Export `signInPasswordSchema` | ✅ flows through `export * from "./auth"` (index.ts) |
| Web sign-in gate: no code change, parse now legacy-compatible | ✅ only tests added to `use-phone-sign-in-mutation.test.tsx` |
| `mapBootstrapErrors` re-validates against strict bootstrap schema; bootstrap UX unchanged | ✅ home-view-auth-utils.ts:53-63 + ZWSP pin |
| Untrimmed current password in Settings (recovery rotation) | ✅ settings-section.tsx:205,216,236 + workspace-mutations.ts:212 |
| Docs: recovery note (primary = sign-in + rotate; last resort = wipe/re-bootstrap) | ✅ `docs/auth-recovery.md` (new file — design left the location open: "decide during implementation"; a top-level auth-recovery.md is consistent with the existing `docs/desktop-auth-boundary.md` doc set) |
| Rejected options (admin reset, OTP) not implemented | ✅ no reset primitive in the diff; `sendOTP` still hard-throws (#283) — verified in `createAuth` |
| Test plan items (contracts matrices, length pins, web utils, mutation, API integration, E2E seed + spec) | ✅ all present and green (see test-audit) |

**Deviation (docs accuracy, not behavior):** the JSDoc on `passwordSchema`
(auth.ts:6) and `signInPasswordSchema` (auth.ts:41) claims change-password uses
`passwordSchema`. It does not — verified against #230's diff (commit `24b8aa3`
gated only sign-in + bootstrap) and better-auth 1.6.20's change-password route
(`newPassword: z.string()` only). The #321 change does not weaken anything that
existed, but the comment asserts a coverage that never existed; it should say
"bootstrap (and client-side change-password checks)" or "bootstrap only".
Also recommended: a follow-up issue for the resulting pre-existing gap (a
ZWSP-only new password via change-password is not rejected client- or
server-side), since the recovery channel makes all-invisible hashes usable at
sign-in. Both are documented in the debate evidence file.

**Critical checks (explicit):**
1. **#230 not weakened for NEW inputs** — ✅ bootstrap is strict at contract
   (authBootstrapInputSchema), client (`mapBootstrapErrors`), and wire
   (bootstrap.service.ts unchanged); change-password untouched by this diff.
2. **Recovery non-destructive** — ✅ sign-in accepts only inputs that verify
   against an existing hash; proven by the API integration test (8-space hash
   signs in; wrong value rejected). No new all-invisible hash can be created
   through any path this diff touches.
3. **Rejected options absent** — ✅.
4. **E2E meaningful** — ✅ live-passing full lifecycle with a genuine better-auth
   hash; final negative step asserts the legacy password fails after rotation.

---

## Summary

- **Standards:** 0 findings (worst: none).
- **Spec:** 1 finding (documentation accuracy — the change-password claim in the
  schema JSDoc, plus a recommended follow-up for the pre-existing ZWSP
  change-password gap); no missing or wrong behavior.

---

## Post-evidence delta (fix loop → `4acc091`)

- **New HEAD:** `4acc09134df13aeb9eff23ed41d097be587fc477`.
- **Spec deviation (docs accuracy) — RESOLVED.** The `passwordSchema` /
  `signInPasswordSchema` JSDoc drift (auth.ts) and the matching claim in
  `docs/auth-recovery.md` ("bootstrap and change-password still reject
  all-invisible passwords") were corrected to state: bootstrap-only schema
  gating; change-password gated client-side only (trim + 8..128); and the
  pre-existing `\p{Cf}`-only change-password gap noted explicitly. No behavior
  changed — the critical checks (1–4) are unaffected.
- **Recommended follow-up (pre-existing ZWSP change-password hole)** — not
  fixed in this PR per fix-loop scope; recorded for the PR body as a follow-up
  issue recommendation.
- **Standards:** still 0 findings (delta is comment/doc text only).
- **Re-validation:** `pnpm typecheck` exit 0 (4/4); `pnpm test:api` exit 0
  (63 files, 1070 tests); `pnpm test:web` exit 0 (58 files, 480 tests).

---

## Post-evidence delta (fix loop → `6812d09`)

- **New HEAD:** `6812d095d4d2802dcf6e8d6759a8dc7f9b2fcfa6` (rounds 2–3 below).
- **Round 2 — E2E bootstrap-owner staging (`b59404d`, fix(e2e)):** the CI
  full-suite run exposed a *staging* bug, not a product one: the suite shares
  one per-run DB, an earlier spec (admin-account) had bootstrapped the
  workspace, and the app shell mounts the owner-gated `workspaceSnapshot` RPC
  after ANY sign-in — so the seeded legacy user (a second user) hit
  `UNAUTHORIZED` and the dashboard never rendered ([26/42] failure). Fixed in
  `tests/e2e/helpers/db-seed.ts` + `tests/e2e/legacy-password-recovery.spec.ts`:
  the seed records the current `app_bootstrap_state` owner, re-points the
  singleton at the legacy user (the honest #321 staging — they ARE the original
  admin), and returns a `restoreOwner` handle the spec invokes in `afterAll` so
  downstream specs keep the canonical admin as owner. Product behavior
  unchanged — the admin gate is intact; critical checks 1–4 still hold.
- **Round 3 — docs policy-scope correction (`6812d09`, docs(auth)):** Greptile
  P2 — `docs/auth-recovery.md` Background still claimed #230's visible-character
  policy applies when a credential is created "(bootstrap, change-password)".
  Change-password is not schema-gated (client-side trim + 8..128 only;
  better-auth's route validates the string plus length). Corrected to
  bootstrap-only enforcement, stated precisely what change-password enforces
  today, and noted the `\p{Cf}`-only (ZWSP/LRM/BOM) gap as a known limitation
  with a follow-up reference. Docs-only — zero behavior change.
- **Standards:** still 0 findings across both rounds (round 2 is E2E staging +
  spec/helper changes; round 3 is doc text).
- **Re-validation:** full 42-test suite green twice (40 passed / 2 skipped,
  legacy spec at [26/42], zero owner-gate errors in the server log); legacy
  spec green twice in isolation (1/1 each); `pnpm typecheck` 4/4; `pnpm
  test:api` 63 files / 1070 tests; `pnpm test:web` 58 files / 480 tests; all
  six hygiene checks exit 0.
