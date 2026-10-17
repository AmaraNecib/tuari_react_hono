# #460 — verification record

- Base: `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`
- Code HEAD (reviewed): `b0de3d0202a229cc24b34e563ac5b97ed3181cca`
- Round 1 reviewed `03ff355d`; round 2 reviewed `b0de3d02`.
- Mode: remote. Tier: Standard. Lane: `fix/460-debt-entry-direction`.

## Commands and results

| Command | Result |
| --- | --- |
| `npx vitest run src/features/debts/debts-mvp-web.test.tsx` (apps/web) | 1 file, **33 passed** (round 1), **33 passed** (round 2) |
| `pnpm --filter @tuari/web typecheck` | exit 0 |
| `npx eslint .` (apps/web) | exit 0 |
| `node scripts/check-i18n-keys.mjs` | missing 0, missing map-key literals 0, exit 0 |
| full web suite `pnpm --filter @tuari/web test` (slot2 held) | **incomplete** — one unrelated timing flake (`createable-select.test.tsx > commits a selection on successive open/close cycles`) under heavy machine load (24 node processes); the run then stalled and was killed. |
| `npx vitest run src/components/ui/createable-select.test.tsx` in isolation | **12 passed / 12** → the failure was a load flake, not this diff. |

The touched suite is green. The full web suite is reported as partial (PENDING a
clean slot), not as a pass.

## Review rounds

- `.scratch/reviews/460/03ff355d-{design-pass,debate,code-review,test-audit}.md` — round 1, **approve, no blockers**; findings F1/F2/F4 raised (stale doc line, orphaned i18n keys, coarse assertion).
- `.scratch/reviews/460/b0de3d02-{design-pass,debate,code-review,test-audit}.md` — round 2 at the final code HEAD, **approve, no blockers**; confirms F1/F2/F4 fixed.

## Dismissed non-blocking note

Round 2 (debate) noted that `accountCurrentBalance={-5000}` in the
`RecordEntryPaymentDialog` test is "an unreachable ledger state (negative
max-payment ceiling)". Dismissed: an overpaid ledger is a real, already-tested
state (`debts-mvp-web.test.tsx` renders `PAYABLE -50,000` → `رصيد مستحق لنا`), and
the fixture's purpose is only to make the entry phrase and the max phrase
distinct so each surface is pinned exactly. The max-payment validation is not
this test's subject.

## Follow-ups needing a parent decision

1. **F4/F3 — unused-i18n-key enforcement.** The deletion orphaned 13
   `dashboardPage.*` keys; this PR pruned them by hand. A lint/test for unused
   i18n keys would prevent re-accumulation (design-pass F3). Recommend filing it
   as its own issue; not filed by this lane.
2. **F5 — contract-side optional `direction` / signed opening** in
   `packages/contracts/src/debts.ts` (pre-existing, carried from the
   debt-terminology pass). Out of scope here.
