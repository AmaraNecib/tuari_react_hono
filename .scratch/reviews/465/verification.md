# Verification — outbound item picker availability (#465)

Lane `fix-outbound-selector`, base `fix/invoice-create` @ `651df4eb`. All commands run
from the worktree root with `VITEST_MAX_WORKERS=2`. Full-suite runs: one API, one web.

## Red/green (behaviour tests proven to fail pre-fix)

Pre-fix means the six production files temporarily reverted with
`git stash push -- <production files>` while the new test files stayed in place; the
contracts dist still carried the new exports so the API suite could run.

| Suite | Pre-fix result | Post-fix result |
| --- | --- | --- |
| `@tuari/contracts test inventory-item-usage` | 6 failed / 7 passed (all six new tests) | 13 passed |
| `@tuari/api test item-offer-equivalence` | 3 failed / 13 passed | 16 passed |
| `@tuari/web test outbound-transfer-create-page` | 5 failed / 0 passed (page still imports the unpaged hook the mock does not provide) | 5 passed |

The three API failures pre-fix were: the SQL/JS agreement sweep, the explicit
availability trap (a definition with no stock at the source was still offered), and the
cursor-scope reset for a different source.

## Green runs

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | exit 0 |
| `pnpm typecheck` | exit 0 (4/4 packages) |
| `pnpm lint` | exit 0 (includes `check:i18n-keys`, unslop, eslint) |
| `VITEST_MAX_WORKERS=2 pnpm test:api` | exit 0 — 91 files, 1643 passed, 2 skipped |
| `VITEST_MAX_WORKERS=2 pnpm test:web` | exit 0 — 98 files, 913 passed |

## What could not be verified here

- **No Playwright run.** The outbound page test is jsdom-level; an E2E spec would need
  ports 3000/4318 and a coordinated E2E lane. The parent owns that slot.
- **No hosted/managed review and no push** per the lane brief.
- The availability rule is verified at the read (SQL/JS equivalence) and the page wiring;
  the server write path's own stock check is untouched and is not proven against it
  (see the design-pass finding and the proposed follow-up).
