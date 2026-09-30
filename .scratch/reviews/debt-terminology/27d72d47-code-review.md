# Debt terminology — local review + test audit

- lane: fix-debt-terminology
- branch: `fix/debt-terminology`
- base SHA: `5d0629be768a75689c081249843af4a79d045230`
- reviewed HEAD: `27d72d474f41509c097784de49b992ae472b4ede`
- rename: pre-rebase `b9bbe578` → pushed `27d72d47` (branch rebased onto `5d0629be`); content unchanged
- evidence commit follows the reviewed HEAD (metadata only)

## Scope reviewed

`git diff 5d0629be...27d72d47`: shared debt state helper + wire enum, web
display helper, all balance render sites, i18n copy, API labels, tests.

## Standards review

- The sign convention still routes through `@tuari/contracts`
  `getDebtAccountNetContribution`; the display state machine is added next to
  it, so the API and the web cannot drift (wisdom: shared sign helper).
- No `git add -A`; staged files listed explicitly. No generated/build
  artifacts in the change (`git status --short` clean after commit).
- Barrel export verified: `packages/contracts/src/index.ts` re-exports
  `./debt-helpers` (wisdom: index re-export).
- Output schema note: `debtBalanceLabelSchema` is a pure validator (enum), no
  transforms (wisdom: output schemas validate).
- Dead code removed: `getDebtAccountBalanceMeta` had no remaining caller.
- i18n key drift gate passes (0 missing literal and map-key keys).

## Spec review (brief)

- Direction labels: PAYABLE → `مستحقات علينا`, RECEIVABLE → `مستحقات لنا`.
- Five states exactly as specified; zero is `مسوّى`, never `مستحق علينا 0`.
- Buttons `تسجيل دفعة` / `تسجيل دين`.
- Old standalone labels retired; only negative test assertions and the
  `debtBalanceLabelSchema` rejection test mention them.
- One shared helper `(direction, signed balance)` → `(phrase key, absolute
  amount)` used by hub, party detail, employee panel, ledger, cases, externals,
  dialogs, reports and global search.
- `formatDebtAmount` is always nonnegative; movement deltas stay signed.

## Test audit

- All four states + zero are covered at the helper level in `@tuari/contracts`
  (100% statements/branches/functions/lines) and in `debt-utils.test.ts`.
- Screen tests assert phrase + positive amount for each state and that no
  balance renders as a negative number (`debt-ledger-panel`, party summary,
  hub, external detail, employee debt tab).
- i18n copy is pinned to `DEBT_BALANCE_STATE_PHRASE`, so the API phrase and the
  UI copy cannot silently diverge.
- Failure/empty states unchanged; the hub/ledger empty rows still render.

## Verification (final HEAD)

| Command | Result |
| --- | --- |
| `VITEST_MAX_WORKERS=2 pnpm --filter @tuari/web test` | 83 files, 737 passed |
| `pnpm typecheck` | 4/4 tasks successful |
| `pnpm lint` | turbo lint 2/2 + all checks green |
| `pnpm check:unslop` | PASS (0 error) |
| scoped coverage, `@tuari/contracts/src/debt-helpers.ts` | 100% |
| scoped coverage, `apps/web/src/features/debts/**` | helper/screens covered; untouched helpers remain |
| `apps/api` company + router suites | 390 passed |
| full `@tuari/api` suite | 13 failures, all in auth recovery-key / bootstrap / update-history sqlite lock-timing tests whose hooks time out; none import or reference debt code (pre-existing flakiness) |

## Greptile

Local CLI is installed but not authenticated (`greptile whoami` →
`error: refresh failed: access_denied`), so no CLI verdict was produced.
Hosted review was explicitly out of scope for this lane.
