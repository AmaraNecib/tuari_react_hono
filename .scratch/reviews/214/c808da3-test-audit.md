# #214 Test Audit — 3-agent test-quality review

Base: `6be3497` · HEAD at review: `f4474fc` → fixed in follow-up commit.
Tier: High-assurance. Agents: edge-case hunter (13d88553), coverage analyst
(217e936d), quality reviewer (d8ff4f92). Raw outputs under
`.pi-subagents/artifacts/*_reviewer_0_output.md`.

## Verdict

No blockers. Acceptable-grade overall: quality reviewer graded the new tests
**A** (origin/account/create-app suites) and **B** overall, with the sole
material downgrade being the inventory test's excessive 36-method repository
stub. Every acceptance criterion has a direct test.

## Findings and disposition

| # | Agent | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | quality | Med | `inventory.service.test.ts` stubs all 36 `InventoryRepository` members for 3 used ones — brittle (future interface additions break its type-check, not the test) | **Fixed** — slimmed to `{ getInvoiceGroupById, withTransaction, createAttachment } as unknown as InventoryRepository` |
| 2 | edge | ORANGE | Per-file 5 MB limit untested (now module-owned enforcement point) | **Fixed** — added per-file >5 MB rejection test |
| 3 | edge | ORANGE | Zero-file input untested (route no longer guards this path) | **Fixed** — added zero-file rejection test |
| 4 | edge | ORANGE | `resolvePasswordChangeActor` catch→null branch not unambiguously exercised | **Fixed** — added explicit `getSession`-rejects test (existing null-session test already hit the catch path via `getCurrentSessionUser` throwing) |
| 5 | quality | Low | `create-app.test.ts` "actor resolved before auth handler" only asserted call counts, not order | **Fixed** — pinned `mock.invocationCallOrder` |
| 6 | edge | YELLOW | No OPTIONS preflight test | **Fixed** — added allowed/blocked OPTIONS pins |
| 7 | edge | YELLOW | Exact count/total boundaries not pinned (10 files / 15 MB inclusive) | **Fixed** — added "accepts exactly 10 files" boundary test |
| 8 | edge/coverage | YELLOW | Empty-string Origin + PUT/DELETE/PATCH same-branch gaps | **Dismissed** — pre-existing, byte-identical semantics, low risk |
| 9 | edge/coverage | Low | MIME-type rejection not covered at module level | **Dismissed** — MIME policy was never duplicated in the route; outside the duplicated-limit scope |
| 10 | all | Low | EOF newlines missing on middleware + inventory test files | **Fixed** (committed) |

## Post-fix verification

- `pnpm --filter @tuari/api test --run` — 1191 passed / 1 skipped
- `pnpm --filter @tuari/api typecheck` — green
- Focused suites: origin-blocking (6) + inventory (6) + account + create-app = 65 passed
## Freshness note (final HEAD eaca0d4)

Reviewed tests at f4474fc; all test-audit findings were applied in 3816512 and verified green (1191 tests). eaca0d4 is a comment-only tidy with no test-file change. Evidence remains valid for eaca0d4.
## Post-evidence note (c808da3)

c808da3 added two inventory tests (bytes loader never invoked on the rejected path; happy path reads each loader once). Coverage of the count/total/per-file/zero-file/boundary/catch/OPTIONS/order confirmed above remains current at 1193 passing tests on c808da3.
