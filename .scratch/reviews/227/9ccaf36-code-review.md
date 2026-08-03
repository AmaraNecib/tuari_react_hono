# Code Review — issue #227 (head 9ccaf36, base f93c37c)

Two-axis review (Standards / Spec) via parallel reviewer sub-agents on
`git diff f93c37c...9d3d1e7`.

## Standards

No documented-standard violations (docs/ARCHITECTURE.md ports & adapters,
transport rules; frontend wiring goes through the typed `rpcClient` /
`@tuari/contracts`). Baseline smells (judgement calls):

- **Duplicated Code** — `recovery-keys.spec.ts` hardcodes `API_URL =
  http://127.0.0.1:4318`, duplicating `playwright.config.ts`. (Kept: matches
  the existing pattern in `foundation-smoke.spec.ts`'s api-health test.)
- **Duplicated Code** — foundation-smoke re-implemented the password locator
  inline. (FIXED: now reuses the exported `passwordField` helper.)
- **Middle Man** — thin async adapters in `RecoveryKeySettings` glue
  (`handleGenerateKeys`, `onRevokeKey`); acceptable prop-signature glue.
- **Shotgun Surgery (mild)** — stale-selector fixes span 5 e2e specs; justified
  to make the new `test-e2e` CI job green (suite was red on develop).
- **Doc/code divergence** — design-doc wire notes contradicted the spec's
  envelope handling. (FIXED: design doc now documents the `{json: input}`
  envelope.)

Noted, accepted: `employees.spec.ts` `describe.skip` (pre-existing API/UI role
mismatch, documented); tour-dismissal try/catch (pragmatic for optional UI);
`isChangingKey={false}` in web (desktop-only PRAGMA rekey); hooks have no unit
tests (thin typed RPC wrappers).

Blocker: none.

## Spec

Correct: generate → masked list → revoke → consume → pool-counts flow fully
covered in `tests/e2e/recovery-keys.spec.ts` (serial); bootstrap-auth helper
reused; CI `test-e2e` job added (chromium via `--with-deps`, `pnpm test:e2e`).

- (a) Missing/partial: none substantive. "Consume" driven via RPC (no web UI —
  password-reset is desktop-only), documented.
- (b) Scope creep: `.gitignore`, other-spec selector fixes, helper fixes.
  `build.needs` was extended to include test-e2e; reverted (test-e2e remains an
  independent gating job, build stays parallel).
- (c) Looks wrong: `callRpc` envelope omitted `meta`/`maps`/`blobs` and sent
  `{json: undefined}` for no-input procedures. (HARDENED: now always sends
  `{json: body ?? null}` — canonical envelope; re-verified green.)

Follow-ups (deferred, documented in the design doc): employees spec skipped
(pre-existing workforce role-validation mismatch), not part of this issue.
