# Code Review — Issue #294 (head `6eb7aac`)

Two-axis review (`git diff 03ec349...HEAD`, commits `ffab8a1`, `6eb7aac`),
parallel Standards + Spec reviewer sub-agents.

## Standards

**No violations, no smells.** All 5 extracted-return sites of
`extractAuthErrorMessage` route through `translateAuthApiErrorMessage`; the
fallback branch deliberately bypasses translation (it is already i18n copy —
matches the design doc). Whitespace normalization is a strict superset of the
previous trim+lowercase. Idempotent for already-Arabic messages (map keys are
English), so the desktop throw-site path is unaffected.

- Judgement call (Duplicated Code, minor): 9× `await import("./auth-api")` per
  test in `auth-api.test.ts` — matches the file's existing dynamic-import style;
  dismissed.
- Process note: `.scratch/reviews/294/` was untracked at review time; committed
  with the evidence (below).

## Spec

**No missing requirements, no scope creep beyond documented intent, no wrong
implementations.**

- Acceptance criterion — "Failed sign-in shows the translated Arabic error
  (`auth.errors.invalidCredentials`), consistent with the desktop path" — is
  implemented at the display seam both paths converge on (toast
  `use-phone-sign-in-mutation.ts:45`, inline `home-view-auth-controller.ts`),
  and both are test-covered.
- E2E narrowing (#254's accept-both regex → Arabic-only) is a **deliberate,
  design-documented deviation** from "stays green either way": it is the
  regression pin for this issue. Accepted.
- Whitespace/case normalization hardening: beyond the issue's ask but harmless
  and pinned by tests. Accepted.
- Latent pre-existing gap (not a regression, not fixed): map matches exact
  normalized keys only — a hypothetical trailing-period message would surface
  English. better-auth's message is fixed; handling punctuation would be
  speculative generality. Dismissed.

## Verdict

Both axes: **no actionable findings** → safe to push.
