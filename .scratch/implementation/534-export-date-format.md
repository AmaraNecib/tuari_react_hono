# #534 export date preference follow-up

Base: `ddad58b75bc3abe6676adb23ca6b508cf2ca4d65` (`origin/develop`). Worktree: `D:/worktrees/tuari_react_hono/t3-ea15db18-1d03eb2298ddfc0a`. Verification mode: focused-local / CI-final-enforced, as specified in #534. Review tier: routine presentation behavior; exports carry no date or financial data transformations.

## Scope

Merged #537 already supplies the local date preference, shared `AppDate`, date formatting and runtime consumer updates. This follow-up addresses the confirmed remaining user-facing export paths only:

- Audit CSV rows used `toLocaleString` directly and ignored the selected date order.
- Inventory, debt and movement report CSV headers formatted `generatedAt` directly and ignored the selected date order.

Audit page display already uses `AppDate`. Report builder display already uses `AppDate`. Amounts, CSV columns other than generated timestamps, wire values, sorting, filters, stored dates and Africa/Algiers time conversion remain unchanged. Technical logs and machine/API serialization are not presentation surfaces. Native date inputs retain their canonical browser-owned display.

## Implementation

Audit CSV formatting now uses the selected preference and current UI locale through `formatDateTimeInAlgeria`. Report CSV formatting accepts the selected order and formats each generated timestamp with the existing Arabic locale and Africa/Algiers clock. The default remains `DD/MM/YYYY` for direct formatter callers.

## Proof and status

Updated the report export regression to assert both default and selected order while preserving the Algeria clock across all report types. The targeted Vitest command could not run: `pnpm --filter @tuari/web exec vitest run src/features/reports/report-builder.test.tsx src/features/audit/audit-log-page.test.tsx` exited nonzero because `vitest` is unavailable in this worktree. No package install was attempted. `git diff --check` passed.

No seam moved. The parent owns review and any additional UI/browser proof. #537's existing UI, preference and RTL/LTR evidence applies to its unchanged shared formatter and mounted date consumers; it does not prove these newly wired CSV callsites.
