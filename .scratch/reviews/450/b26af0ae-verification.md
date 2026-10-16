# #450 — verification evidence (post-review)

- **Issue**: #450
- **Branch**: `fix/450-outbound-entry-id`
- **Reviewed code HEAD**: `b26af0ae` (supersedes the `e37e2561` round)
- **Base**: `origin/develop` @ `073af118`
- **Design**: `.scratch/implementation/450-design.md`

## What the review round changed

`b26af0ae` is `e37e2561` (the original fix) plus the review dispositions:

- **Code**: `normalizePositive` per outbound line (a direct caller could otherwise
  persist an empty transfer); `outboundFromLocation`/one `note` de-duplicated; the
  `ItemOfferCandidate` projection extracted to `itemOfferCandidate`; a redundant
  `mapAssetUnit` cast removed; stale `inventory-item-usage.ts` JSDoc corrected.
- **Tests**: 7 new cases — project-source picker/gate parity, over-request across
  balances + exact-total consume, two lines of one definition against one balance,
  multi-unit asset fan-out, partial-mutation rollback, non-positive quantity, and an
  entry id passed where a definition id belongs. The parity `catch` now asserts
  `BUSINESS_RULE` instead of swallowing any error.
- **Docs**: `450-design.md` gains mode/dependencies/deviations/Playwright-N/A and the
  inbound-path evidence for issue task (3).

## Red → green

New test file `apps/api/src/modules/inventory/outbound-transfer-availability.test.ts`
run with the production source checked out at each state (tests held constant):

```
# 073af118 — original bug
Test Files  1 failed (1); Tests  9 failed | 2 passed (11)
  the 9 failures are the id-collision, split-balance, asset-narrowing, both-source
  parity, over-request, two-lines, asset fan-out, and non-positive cases.

# e37e2561 — first review round
Test Files  1 failed (1); Tests  1 failed | 10 passed (11)
  FAIL ... refuses a non-positive quantity before writing anything
  (the only real code change in the review round)

# b26af0ae — final
Test Files  1 passed (1); Tests  11 passed (11)
```

## Suites (exit 0)

```
pnpm --filter @tuari/api exec vitest run src/modules/inventory \
  src/tests/integration/inventory-transfer-workflow.test.ts \
  src/rpc/handlers/reports.test.ts
→ Test Files 10 passed (10); Tests 135 passed (135)

pnpm --filter @tuari/contracts test
→ Test Files 6 passed (6); Tests 247 passed (247)

pnpm typecheck → exit 0 (4 tasks successful)
pnpm lint      → exit 0 (eslint api + web; unslop PASS)
```

## Review inputs and dispositions

- Debate: `.scratch/reviews/450/b26af0ae-debate.md`
- Code review (Standards + Spec): `.scratch/reviews/450/b26af0ae-code-review.md`
- Test audit: `.scratch/reviews/450/b26af0ae-test-audit.md`
- Design pass: `.scratch/reviews/450/b26af0ae-design-pass.md`

## Risks

- Consumable multi-balance consumption and per-balance movements remain new behaviour
  with no prior working contract (the pre-fix path always threw); now covered by 5 of the
  11 tests.
- Cross-type mis-typed rows can be *offered* (the #465 both-tables rule) then rejected in
  the type-specific branch. Unreachable via the service
  (`createInvoiceGroup` enforces the kind rule at `inventory.service.ts:429,453`);
  dismissed, not fixed.

## Next

Parent owns push/PR. Not done here: push, PR, merge.
