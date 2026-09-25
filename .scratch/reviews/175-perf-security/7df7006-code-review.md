# #175 perf-security — local review evidence (HEAD 7df7006)

## Greptile CLI — BLOCKED (external)

- `greptile whoami` → `59263630+amaranecib@users.noreply.github.com`, org `occ` listed.
- `greptile review --json --branch develop` →
  `error: you've used all 50 trial reviews for this account. Upgrade at https://app.greptile.com/-/settings/billing.`
- `greptile review --agent --branch develop` →
  `error: you're not part of a Greptile organization yet. Run `greptile` to get set up.`

Both JSON and agent modes fail on account billing/org before any diff is sent.
This is an external blocker, not a finding about the code, and it cannot be
resolved from this lane (requires billing upgrade / org setup). The required
local code review below substitutes for the Greptile gate; the blocker is
escalated via `crew_report` with this evidence.

## Local two-axis review (substitute gate)

Base `6be3497`. Diff reviewed: 5 source files + design + evidence.

### Spec axis — does it deliver what the brief asked?

- **auth bootstrap/sign-in/OTP contact point:** `authBootstrap` (the only
  unauthenticated credential-verifying RPC endpoint — setup-secret check) is now
  throttled via the shared per-IP budget. Sign-in/OTP were already hardened
  (30/15-min auth limiter, OTP refuse-to-send #283) — confirmed, no duplicate work.
- **recovery-key and DB-key rotation contact point:** all four rotation mutations
  (`generateRecoveryKeys`, `consumeRecoveryKey`, `revokeRecoveryKey`,
  `changeDbEncryptionKey`) now use `mutationAuditRateLimited` (auth+audit semantics
  unchanged, per-IP budget added). No wire-format change.
- **transport / body / origin, attachment upload, desktop bridge:** reviewed and
  documented as already hardened (#272/#283); no changes needed. No duplication of
  #214 (transport seam), #242 (reports stubs), or #334 (separate lanes).
- Only LOW-RISK fixes implemented; residual risks (rate-limit key collapse,
  LAN/public API_HOST, fully-buffered attachment download) documented in the
  findings report and escalated, not silently changed.

### Standards axis — does it follow repo conventions?

- Reuses the existing `mutationAuditRateLimited` wrapper — no new limiter
  plumbing, same 100 req/15 min budget, keyed identically (socket-first,
  proxy headers only when trusted).
- `rateLimit(context)` helper mirrors the existing wrapper shape (throws
  `ORPCError("TOO_MANY_REQUESTS")` synchronously, doc comment in repo voice).
- No new public API, no contract changes, no generated output committed.
- The 4 added tests follow existing suites: `rpc-middleware.test.ts` unit +
  socket-keying (mirrors the `*RateLimited` tests), `router.test.ts` black-box
  client proofs (mirrors the wire-contract tests, uses the same harness).

### Findings from this review

- **None actionable.** The 101st-call rejection is verified through the router
  client (wire-level), and the service mock `toHaveBeenCalledTimes(100)` proves
  throttling happens before handler invocation — the actual risk the fixes target.
- One noted-and-accepted tradeoff: an active admin doing >100 recovery/DB-key
  rotations in 15 min from one IP will now be throttled; rotation is rare and the
  budget is generous relative to usage, so this is acceptable (documented in the
  design doc).

## Verification (post-change, pre-commit — tree unchanged by commit)

- `pnpm --filter @tuari/contracts build` ✅
- `pnpm --filter @tuari/api test` — 67 files, **1174 passed / 1 skipped** ✅
- `pnpm --filter @tuari/api typecheck`; `pnpm typecheck` (turbo) ✅
- `pnpm lint` (turbo: hygiene + eslint per package) ✅
- `pnpm test:web` — 59 files, **494 passed** ✅

## Verdict

Ready to report. Greptile gate blocked by billing — escalated. All local checks
green; two-axis review found no actionable findings.