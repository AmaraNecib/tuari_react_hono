# Issue #44 — real-browser combobox regression coverage

- **Mode:** remote (the request explicitly authorizes the issue branch push)
- **Ticket source:** user-provided Issue #44 brief; GitHub issue text is reproduced in the task prompt
- **Base:** `origin/develop` at `0165b7e`
- **Review tier:** Standard (Playwright tests and E2E fixture helpers)

## Scope and contracts

Add `tests/e2e/select-combobox-regression.spec.ts` as the browser-level proof for the #28 `CreateableSelect` placement change (`alignItemWithTrigger=false`). The test will exercise user-visible geometry, keyboard selection, repeated click selection, and representative consumers. It will not inspect select classes or Base UI internals. A small extension to `tests/e2e/helpers/db-seed.ts` may insert unique counterparty, employee, and item fixtures into the already-running E2E SQLite database; these helpers are test-only and do not change application APIs.

## Planned browser coverage

1. Open the invoice-create counterparty combobox in a normal viewport and assert its popup and options stay inside the viewport. Assert the selected option's box is not trigger-aligned, while the popup is placed below the trigger in standard bottom-side mode.
2. Use a 900x700 context and move the invoice-create counterparty combobox to the nested shell scroll container's viewport edge. Assert collision-aware placement keeps the popup and a target option fully visible.
3. On the invoice-create counterparty combobox, send `ArrowDown` three times and `Enter`; assert the trigger displays the selected human-readable name and not its UUID.
4. Repeat open → click option → popup closes → trigger label updates for 12 cycles in one test.
5. Exercise representative consumers end-to-end: invoice-create counterparty plus its debt `NativeSelect`, and warehouse-create manager `CreateableSelect`.

Fixtures are unique per test attempt (`uniqueSuffix`). The spec resets transactional tables before each serial test, then reboots/signs in through the existing helper, keeping option counts deterministic and retries isolated.

## Dependencies and ownership

- Existing `CreateableSelect`/`Select` behavior and the merged #28 implementation are production dependencies; no production code changes are planned.
- Existing `bootstrapOrSignIn`, DB discovery, and reset helpers remain the E2E ownership boundary.
- No old geometry/zoom assertions were found under `tests/e2e`; the existing jsdom assertion in `createable-select.test.tsx` is intentionally unchanged because this issue adds real-browser geometry proof.

## Risks and validation

- Base UI popup exit transitions can leave DOM nodes mounted briefly; assertions will use web-first visibility/hidden checks and re-query options each cycle.
- Arabic UI labels are existing app strings only; fixture names are unique test data, not new translations.
- Fixed Playwright ports must be checked for active sibling work before each E2E run. The full `pnpm test:e2e` suite is required, followed by web tests, typecheck, lint, and the repository review/guard lifecycle.
- Generated Playwright reports and SQLite files are ignored/generated and must not be staged.
