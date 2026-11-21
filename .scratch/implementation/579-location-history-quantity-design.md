# Location history movement quantities

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-4e157f3d-869ab242e4185e3b`.
Base: `c758f55879ee21b73c67820f9475cf153a4b57ee`.
Renderer/test proof HEAD: `cc22b18045bcee6bcc795f597dc72c6bd39b9e16`. E2E selector correction is in the current follow-up commit.
Mode: focused-local / CI-final-pending, high assurance. The browser trace showed the mounted location history omitted item quantities although the typed transfer response carried them. Parent owns combined-delta review, affected browser recheck, publication and merge.

## Domain and interface

A transfer history row contains individual item movements. Each item's quantity belongs beside that item's name; do not total quantities across items because their units may differ. The renderer consumes the existing `TransferHistoryItem.items[].quantity`; no API, accounting, stock calculation, locale formatting or query behavior changes. Convert the existing numeric value directly to text without rounding, and isolate the quantity's left-to-right `×` notation with `bdi` in the RTL row.

The existing `LocationTransferHistory` props and query hook remain the module interface. The row gains a stable test identity so browser coverage anchors to the rendered history row rather than incidental rounded CSS. No seam moved.

## Verification on committed source/test HEAD

Toolchain reuse was read-only: root and web `node_modules` in this worktree were absent, then junctions were created to the parent's matching installed directories. The parent worktree is at base `c758f55879ee21b73c67820f9475cf153a4b57ee`; its `packages/contracts/dist` output is ignored/untracked, not a committed artifact. No install, download, build, generation, server or browser command ran. Test and compiler entry points ran from the local web worktree, so Vite aliases/config resolved this tree's changed renderer and test.

- `node .../vitest.mjs run src/features/inventory/location-transfer-history.test.tsx src/features/inventory/transfer-history-page.test.tsx src/features/inventory/transfer-history-hooks.test.tsx --reporter=verbose` — exit 0; 3 files, 5 tests passed; Vitest duration 9.41s. Raw output: `.scratch/sessions/location-history-vitest-restored.log`.
- `node .../typescript/bin/tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0; 19,749ms. Raw output: `.scratch/sessions/location-history-typecheck-final.log`.
- `node .../eslint/bin/eslint.js src/features/inventory/location-transfer-history.tsx src/features/inventory/location-transfer-history.test.tsx` from `apps/web` — exit 0; 1,635ms. Raw output: `.scratch/sessions/location-history-eslint-final.log`.
- Negative discrimination: temporarily removed only the rendered quantity, ran the mounted renderer test, observed exit 1 at `getByText("×5")`, then immediately restored the committed source. Raw output: `.scratch/sessions/location-history-negative-probe.log`.
- An earlier test attempt failed because this project does not install the `toHaveTextContent` matcher; the test was corrected to use native `textContent`. The initial failure log is `.scratch/sessions/location-history-vitest-20261121-001.log`; it retains an abbreviated failure summary, not complete matcher diagnostics. `.scratch/sessions/location-history-vitest-final.log` records a later passing run. The final passing execution above follows the correction.

Final source fingerprints (SHA-256): renderer `45d5c1ebd8c9b04121951e7ae0e51a17290ffb313eb69ac234c21341e98feb47`; renderer test `468fe3176f63ceb7f7c6dafbfc79e6bacbbcb65fa31d061def9c566edf0d42cd`; pre-visibility-correction E2E spec `bed598a7b64c0c1ad010f4a28e8b6cb566df11519aef287912f99a8d2677c530`. The integrated E2E selector also requires the same exact quantity to be visible; that final change still requires committed-head verification. Renderer and renderer-test hashes are unchanged from the preceding verified HEAD; the E2E file alone changed in this correction.

## Proof coverage and limits

The mounted regression renders separate purchase quantity 10 and internal transfer quantities 5 and 0.000001, asserts each remains paired with its item name, and verifies outgoing direction, transfer type and destination. Existing page and hook tests cover prior transfer history display and pagination behavior. The negative probe proves the new test detects the original omission. Existing loading/error/empty/pagination rendering was not altered.

The E2E selector now scopes to exactly one semantic row containing the unique created item and destination warehouse, then requires exactly one `bdi[dir="ltr"]` whose complete text is `×5`, plus internal type and outgoing direction in that row. This avoids global first-match and substring quantity ambiguity. Its targeted TypeScript check passed: `node .../typescript/bin/tsc --noEmit --pretty false --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types node --lib ES2022,DOM tests/e2e/inventory-transfer.spec.ts` — exit 0; raw output `.scratch/sessions/location-history-e2e-typecheck-final.log`. This execution predates the final visibility assertion; current-head browser proof remains pending. A direct ESLint attempt outside the web config base was ignored (exit 0 with warning), so it is not counted as lint proof; raw output `.scratch/sessions/location-history-e2e-eslint-final.log`.

The earlier renderer test, web typecheck, scoped renderer lint and negative probe remain valid and are carried forward unchanged; the renderer and renderer-test fingerprints confirm no modification. No browser run is claimed in this worker lane; parent performs one affected browser recheck. No API/contracts, accounting, stock calculations, locale cleanup, unrelated E2E specs, full suite, build, dependency install or publication. Applied matching lesson search; no directly applicable lesson was found. No lesson candidate.
