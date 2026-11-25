# Integrated boundary fixes

Base: `76490d70e128f411d3adacae0569298a5a4075ee`.
Worktree: `D:/worktrees/tuari_react_hono/t3-8efca1b0-793b4257422af66f`.
Mode: focused-local / CI-final-pending. Tier: high assurance, bounded correction for two observed integration failures. The parent owns fresh combined-delta review and integration validation. This task is not eligible for the routine-review trial because it touches the exhaustive money-consumer inventory.

## Scope and semantics

The id-less invoice-details route returns to the invoice list. Its missing-record heading should therefore use `inventoryPage.invoices.title`, the existing Arabic `الفواتير`. Definition loading and error states refer to the catalog of item definitions, not stock balances. They use `inventoryPage.itemDefinitions.title`, the existing Arabic `دليل العناصر`. No locale resources or stock UI keys are deleted. Existing RTL, roles, navigation and layout stay unchanged.

The exact-money import inventory includes `inventory-history-read.ts`, which imports `Money` directly from `@tuari/contracts`. The removed entries, `externals-page.tsx` and `transfer-history-page.tsx`, use the shared exact-money-display module instead of directly importing the contracts. The scanner, roots, test-file exclusions, sorted exhaustive equality assertion and monetary-column counts remain unchanged. The expected direct-consumer inventory has 47 paths.

Writable scope is three correction files, two existing tests with narrow title assertions, and this note. No money arithmetic, schema, API, policy, dependency, locale-resource or stock UI changes are included.

## Interfaces and design

The agreed test interfaces are the mounted missing-record route, mounted inventory definition loading/error states, and the existing exhaustive source scanner. Tests assert literal Arabic labels from the resource contract rather than deriving expected labels from the same translation key as production. This catches a raw-key result even when translation mocks would hide it.

Domain vocabulary remains invoice list, item definition catalog, and direct exact-money consumer. These are existing concepts, not new domain types. Architecture: no seam moved. Module interfaces, depth and direct callers are unchanged. Adding a translation adapter would duplicate i18next's existing resource lookup without hiding any additional complexity. Deleting this correction restores raw keys and an inaccurate expected inventory, not a missing abstraction.

## Proof and recovery

Recovered the retired worker's binary diff and untracked design explicitly. Retired source and logs were not modified. Baseline diagnosis and checker output are copied under ignored `.scratch/reviews/579-boundary/baseline`; the original diagnostic paths remain available. All new executions run in this worktree.

Restored existing locked dependencies with `pnpm install --offline --frozen-lockfile`. No manifest or lockfile changed. Root TypeScript resolution is present. Built this tree's absent contracts dist through `heavy_run`, required for mounted route tests and web type resolution. No shared generated output was written.

Affected proof comprises the direct i18n checker and its actual Node test wrapper, all three exhaustive inventory tests, two selected mounted title cases, web/contracts typechecks, and scoped web ESLint from its package cwd. Contracts has no configured ESLint script or config; its test is checked by TypeScript and execution. Full suites, native, browser and hosted checks are outside this bounded correction.

An independent disposable scanner-visible API source importing Money makes the exhaustive inventory assertion fail. It is removed in a finally block. A separate temporary mutation restores the two old production translation keys and makes both selected mounted tests fail, then restores original source bytes in a finally block. Passing proof follows restoration. Logs retain tooling failures separately: initial package-local Vitest path did not exist, and the first new loading assertion ran before lazy route loading completed. The corrected assertion awaits the mounted text.

## Wisdom

Applied `test-mocks-that-return-the-fallback-mask-missing-keys`: use actual i18n and independent literal expected text. Applied `adding-an-i18n-key-you-don-t-wire-is-dead-code-that-byte-duplicates-the-inline-string`: reuse existing resource keys without introducing unused leaves. Applied `i18n-drift-t-is-not-a-fallback-classify-before-scanning`: preserve checker semantics; interpolation options are not a fallback. Excluded broad cache invalidation and architecture lessons because no query key, mutation or module interface changes. No matching import-inventory lesson exists in the current wisdom index. Candidate lesson for the parent: await lazy route mounting before asserting localized pending states.
