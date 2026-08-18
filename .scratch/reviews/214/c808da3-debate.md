# #214 Debate — Adversarial review (critic + defender)

Base: `6be3497` (origin/develop) · HEAD at time: `b7ed093` (fixed during debate →
`f4474fc`) · Tier: High-assurance.
Raw agent outputs (critic + defender) archived under
`.pi-subagents/artifacts/{66ec31e9,3a4bd0b0}_reviewer_0_output.md`.

## Verdict

No blockers (8-10), no majors (5-7). Both agents independently confirmed all
three refactors are behavior-preserving:
1. Attachment-limit removal is **behavior-neutral** — the route's stale 25 MB
   total was dead code (service's 15 MB bound is stricter and rejects first
   with byte-identical messages); the global 30 MB bodyLimit still dominates.
2. Change-password audit ordering (actor resolved BEFORE `auth.handler` so it
   survives a session revoke) is preserved exactly; policy (resolve-or-null,
   warn-and-skip, warn-don't-break) moved cleanly into `AccountService` with
   byte-identical messages.
3. Origin middleware collapse reproduces fails-closed semantics for all three
   prefixes; the auth top-level GET/HEAD safelist is preserved as an explicit
   option and only ever exempts the *missing-origin* case (regression test
   pins that a disallowed-origin GET still 403s).

## Findings and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | 2 | `transport.isAllowedOrigin` passed as an unbound reference into the middleware factory — safe today (arrow closure, no `this`), but a future `this`-dependent refactor would silently fail closed (403 on everything) | **Fixed** (`f4474fc`) — pass `(origin) => transport.isAllowedOrigin(origin)` at all three call sites |
| 2 | 1 | `origin-blocking.ts` / `.test.ts` missing trailing newline | **Fixed** (`f4474fc`) |
| 3 | 1 | Audit errors are swallowed best-effort (incl. DB outage during session lookup) | **Dismissed** — byte-identical to pre-refactor route behavior; not a regression. Worth a wisdom note |
| 4 | residual | Auth GET/HEAD safelist is method-only and broad; origin middleware also runs on OPTIONS preflight | **Dismissed** — pre-existing semantics, preserved-by-design, byte-identical to old inline blocks |

## Post-fix verification

- `pnpm --filter @tuari/api typecheck` — green
- `pnpm --filter @tuari/api test --run` — 1187 passed / 1 skipped
## Freshness note (final HEAD eaca0d4)

Reviewed code behavior at b7ed093/f4474fc. Between the review and final HEAD eaca0d4 the only implementation changes were the debate's own findings: f4474fc (bound origin closure, trailing newlines) and eaca0d4 (comment-only tidy). Test hardening (3816512) is out of the debate's scope (tests reviewed by test-audit). Evidence remains valid for eaca0d4.
## Post-evidence note (c808da3)

The final commit c808da3 (lazy attachment byte-loading, Greptile P2 fix) postdates this debate. It changes only the attachment-buffering concern (InventoryUploadFile.bytes -> lazy loader; service buffers after validation); it does not alter the audit or origin behavior this debate reviewed, and it is pinned by the new no-bytes-on-reject + happy-path-bytes module tests plus the clean 5/5 local Greptile run on c808da3 itself.
