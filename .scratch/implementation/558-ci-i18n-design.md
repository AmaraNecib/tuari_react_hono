# PR 579 production i18n key gate

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-aa4e57f2-308f0b752ab21cdc`
- Base: `18b065b1345653166eec74ade50ba9c41b7333fc`
- Goal: resolve the production translation-key gate without changing its detection rules.
- Verification: focused-local / CI-final-pending. Financial integration delta; three parent review lenses remain required.
- Writable scope: Arabic WEB translation resource only. No changes to checker, tests, contracts, financial calculations, or CI policy.

## Findings and dispositions

- `search.debtOwedByUs` and `search.debtOwedToUs` were introduced at `home-view-signed-in-shell.tsx:252` in this PR's exact debt-search integration. Added Arabic labels `مستحق علينا` and `مستحق لنا`; no fallback or exemption was added.
- Ten `detailPages.employee.finance*` leaves were unused. The employee detail page still displays current salary/reference period and the finance section heading/description, but the old payment-count, aggregate, table-column, and empty-state copy has no production caller. Removed only the ten reported orphan leaves; retained live finance fields and heading copy.
- `externals.details.ledger` had no production translation caller. The current debt ledger is rendered by the debts feature; this orphan belonged to the old external-detail copy. Removed it.

## Proof

- `node scripts/check-i18n-keys.mjs --report`: 0 missing direct keys, 0 missing map-key literals, 0 unused resource leaves. 9 redundant fallback warnings and 26 dynamic sites remain reported for review.
- `node --test tests/i18n-keys.test.mjs`: 8/8 passed, including orphan rejection and production resource coverage.
- Checker behavior and test sources were not modified.
