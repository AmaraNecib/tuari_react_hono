## Barrel re-exports: "export the const" is incomplete without the index re-export (🟠 Major)

Issue #206 said "export `reportFilterInputSchema` from `reports-contract.ts`", but that module was imported only by `app-contract.ts` and NEVER re-exported from the package index, so the exported const was still unreachable from `@tuari/contracts` (the only import path the API uses). The fix needed BOTH the `export const` AND `export * from "./reports-contract"` in the index (consistent with `invoice-contract`/`payment-contract`/`update-contract`/`rbac-contract`). The test failure (`reportFilterInputSchema` undefined) caught it immediately.

**Always**: when an issue says "export X from module Y", verify module Y is actually reachable from the package entry (`src/index.ts`) before implementing. Grep the index for `export * from` covering Y.

