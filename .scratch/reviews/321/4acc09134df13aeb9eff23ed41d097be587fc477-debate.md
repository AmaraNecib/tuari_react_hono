# Debate Evidence — Issue #321 (High-assurance tier)

- **Base:** `origin/develop` @ `3c14490`
- **Head (evidence SHA):** `5c6f8a4b102a546eab76c6a882e4b822914ec72a`
- **Branch:** `refactor/issue-321`
- **Run:** critic + defender read the same inputs — `git diff origin/develop...HEAD` (13 files, +641/−18), full changed sources, `.scratch/implementation/321-design.md`, issue #321 context (#230 history), plus live verification: ran all unit/integration tests and the E2E spec.

## Verdict

No blocker (8–10) findings. The implementation is correct and non-destructive:
sign-in became verification-only, bootstrap stayed strict, and no rejected option
was secretly implemented. Two **should-fix** documentation-accuracy findings
(one of which also exposes a pre-existing #230 coverage gap worth a follow-up
issue) and two nits. Everything else the critic raised was dismissed with
evidence.

## Live verification performed (critic/defender both relied on this)

- `packages/contracts`: 142 tests pass.
- `apps/web`: changed test files (17 tests) pass.
- `apps/api`: `auth.test.ts` (4 tests) pass — including the #321 recovery
  integration test that seeds a real better-auth scrypt hash of `"        "`
  and signs in against it.
- `tests/e2e/legacy-password-recovery.spec.ts`: **passes live** (38s) — full
  recovery flow: legacy sign-in → rotation in Settings → new-password sign-in →
  legacy password rejected.
- `eslint` clean on all changed web/API files; `tsc --noEmit` clean on
  contracts, web, and API.
- Verified in `better-auth@1.6.20` dist (`update-user.mjs`): the change-password
  route validates `newPassword: z.string()` only — no min/max, no visible-char rule.

## Synthesis / disposition

| # | Finding (critic) | Severity | Disposition |
|---|---|---|---|
| 1 | `passwordSchema` JSDoc (auth.ts:6) and `signInPasswordSchema` JSDoc (auth.ts:41) claim change-password uses `passwordSchema`. False: #230 (commit `24b8aa3`) gated only sign-in + bootstrap; the change-password path (settings-section.tsx → workspace-mutations.ts → better-auth `changePassword`) has never been schema-gated — better-auth validates `newPassword: z.string()` only. Misleading in a security-critical comment. | 5 | **Should-fix** — correct the comment to say bootstrap only (sign-in verifies; change-password is client-side gated). |
| 2 | Pre-existing #230 coverage gap surfaced by the recovery channel: a ZWSP-only (or other `\p{Cf}`/`\p{Mn}`) NEW password via change-password bypasses every gate — client `trim()` does not remove format chars, the mutation checks length only (workspace-mutations.ts:213), and the server accepts any string. Such a hash can then be signed in via the new lenient schema. NOT introduced by #321 (verified against #230's diff — change-password untouched), but the new comment at auth.ts:41 now claims this is covered. | 5 | **Defer → follow-up issue** (out of #321 scope; fix would be a change-password policy gate, a separate change). Correct the comment in the meantime. |
| 3 | settings-section.tsx:205-236 — a stray-whitespace current-password entry (e.g. `"  "`) now counts as a password change and forces a "new password required" error where previously (trimmed to `""`) it was silently ignored. Behavior change, arguably more correct (a non-empty current password without a new password is malformed), but a possible UX surprise. | 2 | **Nit** — acceptable; matches the mutation's own contract (workspace-mutations.ts:216-220 already throws `accountPasswordNewRequired` in this case). |
| 4 | "Weakening #230" (the central concern) | — | **Dismissed** — defender evidence: sign-in is verification-only; an all-invisible input can only match a hash created from that exact value, which is impossible for post-#230 accounts (bootstrap is strict client + wire gate, unchanged); the API integration test proves hash matching is the only gate and a wrong whitespace value is rejected. No new all-invisible hash can be created through any path #321 touches. |
| 5 | `signInPasswordSchema` duplicates `min(8).max(128)` from `passwordSchema` (duplicated code smell) | 1 | **Dismissed** — deliberate, documented split along the creation/verification boundary; bounds keep the wire input bounded; the two schemas are pinned together by the contracts test matrices. |
| 6 | `mapBootstrapErrors` re-check line (home-view-auth-utils.ts:58) is 116 chars | 1 | **Dismissed** — repo norm; settings-section.tsx contains pre-existing 200+ char lines; eslint clean. |

## Defender highlights (agreed)

- The verification/creation boundary is the right seam: lifting the client gate
  for sign-in is strictly less privilege than any reset-without-old-password
  primitive (admin reset / OTP were correctly rejected in the design doc, and
  no code for them exists in the diff — `sendOTP` still hard-throws per #283).
- The recovery path is non-destructive and requires proof of identity (the old
  password must actually verify against the stored hash).
- `mapBootstrapErrors` reuses the already-computed strict `result` — no
  double-parse; bootstrap client UX is preserved (`passwordWhitespace` copy).
- The untrimmed current-password change (settings-section.tsx:236,
  workspace-mutations.ts:212) is exactly right: passwords are opaque secrets and
  the hash is computed over exactly what the user typed — trimming the legacy
  value would have broken verification.
- `signInPasswordSchema` export flows through `export * from "./auth"`
  (index.ts) with no extra wiring.
- E2E staging via `seedLegacyPasswordUser` is the only honest way to stage a
  pre-#230 user (the bootstrap UI cannot create one), and it uses better-auth's
  own `hashPassword` so the scrypt parameters cannot drift.
- The E2E gates the rotation step on the `/api/auth/change-password` response
  (200) before asserting the toast — deterministic, per repo testing wisdom.

## Critic report (full)

_Scope: `git diff 3c14490...5c6f8a4` (13 files), issue #321 + #230 history, design
doc, live verification as listed above._

1. **Comment/reality drift (auth.ts:6, auth.ts:41).** Both new JSDoc blocks assert
   that change-password uses the strict `passwordSchema`. I verified this is
   false on every layer: #230's commit gated `phonePasswordSignInSchema` +
   `authBootstrapInputSchema` only; no code path (web, API, contracts,
   better-auth core) validates a change-password NEW password against
   `passwordSchema`. `rg passwordSchema` hits only bootstrap, sign-in, and test
   files. The better-auth change-password route validates `z.string()`.
2. **Uncovered new-input hole becomes reachable.** Because the sign-in schema is
   now lenient, an all-invisible hash created through ANY path becomes usable.
   Bootstrap cannot create one (strict, client + wire). Change-password can:
   `"\u200B".repeat(8)` survives `trim()`, passes the mutation's length check,
   and the server accepts it. Pre-existing, but the recovery feature makes it a
   live hole and the comment claims it is closed.
3. **Whitespace-current-password form semantics changed** (settings-section.tsx).
   Old code trimmed the current password; a spaces-only entry was treated as
   "no password change". New code treats it as a change → requires a new
   password. Correct for recovery, mildly surprising for a user who types stray
   spaces while editing their name/phone.
4. Minor: no unit test covers the settings-section form-level path directly (see
   test-audit); the two new mock-dashboard tests duplicate wrapper boilerplate.

## Residual risks

- #2 above is a genuine pre-existing hole in the #230 policy (new-input
  coverage for change-password is client-side only). Tracked as a follow-up
  issue recommendation; not a #321 regression.
- The desktop (Rust Core) sign-in bridge is gated by the same web mutation parse,
  so the lenient schema also relaxes the desktop path — intended, but the Rust
  side is not covered by these tests (verified by design, not by automation).

---

## Post-evidence delta (fix loop → `4acc091`)

- **New HEAD:** `4acc09134df13aeb9eff23ed41d097be587fc477` (commit `docs(auth): correct
  change-password scope claims in schema JSDoc + recovery doc (part of #321)`).
- **Finding #1 (should-fix, comment/reality drift) — FIXED.** `passwordSchema` and
  `signInPasswordSchema` JSDoc in `packages/contracts/src/auth.ts` no longer claim
  change-password uses `passwordSchema`; they now state bootstrap-only, the
  client-side-only change-password gate (trim + 8..128, settings-section.tsx /
  workspace-mutations.ts), and the pre-existing `\p{Cf}`-only gap explicitly.
  `docs/auth-recovery.md` Background + Notes corrected the same claim and gained a
  known-gap bullet. Comments/docs only — zero behavior change.
- **Finding #2 (pre-existing ZWSP change-password hole) — NOT fixed, deferred.**
  Out of #321 scope per the fix-loop instructions; surfaced in the PR body as a
  follow-up issue recommendation (a change-password policy gate).
- **Findings #3/#4 (nits) — unchanged**, accepted as-is.
- **Re-validation:** `pnpm typecheck` exit 0 (4/4); `pnpm test:api` exit 0
  (63 files, 1070 tests); `pnpm test:web` exit 0 (58 files, 480 tests). E2E not
  re-run (comment-only delta; spec validated live against identical behavior at
  `5c6f8a4`).
- Standards impact: none (no code behavior changed; delta is comment/doc text in
  reviewable files, hence the SHA rename per the evidence-refresh convention).
