# #534 export date preference follow-up

Base: `ddad58b75bc3abe6676adb23ca6b508cf2ca4d65` (`origin/develop`). Worktree: `D:/worktrees/tuari_react_hono/t3-ea15db18-1d03eb2298ddfc0a`. Verification mode: focused-local / CI-final-enforced, as specified in #534. Review route: three distinct initial lenses, as required for runtime behavior. Exports change date presentation only, not financial values or stored instants.

## Scope

Merged #537 already supplies the local date preference, shared `AppDate`, date formatting and runtime consumer updates. This follow-up addresses the confirmed remaining user-facing export paths only:

- Audit CSV rows used `toLocaleString` directly and ignored the selected date order.
- Inventory, debt and movement report CSV headers formatted `generatedAt` directly and ignored the selected date order.

Audit page display already uses `AppDate`. Report builder display already uses `AppDate`. Amounts, CSV columns other than generated timestamps, wire values, sorting, filters, stored dates and Africa/Algiers time conversion remain unchanged. Technical logs and machine/API serialization are not presentation surfaces. Native date inputs retain their canonical browser-owned display.

## Implementation

Audit CSV formatting now uses the selected preference and current UI locale through `formatDateTimeInAlgeria`. Report CSV formatting accepts the selected order and formats each generated timestamp with the existing Arabic locale and Africa/Algiers clock. The default remains `DD/MM/YYYY` for direct formatter callers.

## Proof and status

The initial attempt could not locate Vitest. Recovery compared the donor and this tree's lockfile byte-for-byte, then created ignored, local per-package dependency links. Workspace packages resolve to this tree, never donor product source. Contracts were compiled from this tree. No package was installed or manifest/lockfile changed for recovery.

Actual focused execution found a regression in the initial export patch: the shared formatter's short-clock default omitted seconds. Both CSV paths now explicitly retain medium clock precision. Actual downloaded Blob tests cover all four orders for audit and all three report variants, the Africa/Algiers midnight crossing, Latin digits and absence of bidi control marks, unchanged report bodies and wire requests. Audit selection proof covers all searched rows beyond the visible page, excluded rows and the empty-result download boundary. Existing inclusive date-picker bounds remain exercised.

Three initial lenses passed `0639e5a0`, as reported by the parent. The subsequent develop integration merges `0b4afbc7` without conflicts. Its offline diagnostics dashboard changes no date-export caller or formatter. No semantic conflict or new date interface is introduced. Carry the prior code conclusions forward; the parent decides whether its governance requires a fresh integration-delta review. Final scoped execution belongs in a fresh ignored `.scratch/reviews/534-integrated-*` directory with exact SHA, commands, exits and durations. Earlier failed logs remain separate.

No seam moved. Generated display text remains distinct from canonical business days, offset-bearing query instants and persisted timestamps. The shared formatter owns locale/timezone behavior; the export adapters supply the preference and prior clock precision.

## Acceptance and integration boundaries

#537 supplies the unchanged accessible setting, persistence/session fallback, mounted consumers, caller inventory, physical RTL/LTR geometry and prior cropped visual proof. This follow-up proves the CSV callsites through actual downloads; it does not present unaffected shell screenshots as new visual evidence. The original #537 geometry helper is synthetic component proof, not a real authenticated laptop journey. No fresh real-laptop execution or owner UI approval is claimed here.

Reviewed #621 and #622 file inventories. The follow-up integration incorporates merged #621 at develop `905a2e3832581207206c529e5e893d44b6fd3655`. One textual conflict in report-builder's download handler was resolved by retaining the selected date preference inside #621's try/catch, generic localized failure toast and object-URL revocation. Report tests auto-merged; successful download stubs now model revocation explicitly and assert no failure toast for every order and report variant. Audit shared-query tests auto-merged and retain both the locale mock and the safe correlation-code assertion with raw exception text excluded. A fresh independent integration-delta review is required before publication because this conflict touches executable behavior.

#622 adds manual-settlement date consumers outside this branch; no unpublished peer implementation was copied, and those new consumers require inventory reconciliation after merge. Technical logs, machine serialization and native date-input values keep their documented exclusions.

The supplied mode is focused-local / CI-final-enforced. The coordinator's `chore-ci-final-workflow-adoption/.scratch/sessions/ci-final-owner-acceptance-616.md` records owner acceptance and effective ruleset enforcement. Current-head hosted acceptance, effective protection, hosted 5/5, explicit owner UI acceptance and manual merge remain parent/owner gates. Local success does not close #534.
