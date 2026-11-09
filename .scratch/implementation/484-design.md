# Pin stored instants to Algeria

## Scope and authority

Issue #484, https://github.com/AmaraNecib/tuari_react_hono/issues/484.
Owner authorized unattended implementation, publication and merge into develop.
Worktree: `D:/worktrees/tuari_react_hono/fix-v1-issue-484`.
Base: `93be734450380ddcf0e91590f0ce73e22bf5029a`, including prerequisite PRs #507 and #508.

Verification mode is `focused-local / CI-final-enforced`. Live ruleset 26837184
was read on 2026-11-09. It is active on develop, has no bypass actors, requires
strict up-to-date `CI acceptance` from app 15368 and resolved review threads.
The checked-in activation record still describes the earlier pending rollout.
Fresh effective settings, not that historical text, control this authorized run.
No protection changes are authorized.

## Behavior and domain

A stored instant identifies an event time. Display its date and time in
Africa/Algiers regardless of the workstation zone. A stored business day is a
different concept and remains date-only. No write, range, money or financial
rule changes. Existing neighboring typography, RTL, spacing and interactions
stay unchanged. Preserve the current Arabic numeric date, time and seconds by
adding an explicit timezone option rather than switching formatter styles.

Apply the existing `getAlgeriaTimeZone` interface to the eight issue sites:
audit display and CSV, asset revision history, invoice movement history,
report display and three report CSV branches. The invoice-date behavioral test
requested by the issue already exists in the base and is retained and run.

## Rule and interfaces

Extend the existing TypeScript AST hygiene scanner, not ESLint or a new package.
A receiver-shape heuristic recognizes inline `new Date(...)` receivers of
`toLocaleString`, including wrapped/computed/optional calls and interpolation.
It intentionally does not infer unknown bindings, aliases or factory returns.
This matches every current production instant call without classifying number
formatting as dates. Self-tests make that limit and money exclusions explicit.
Existing timezone-option effectiveness checks remain shared across formatters.

No production interface or seam moves. The shared zone helper already earns
its locality; a new pass-through formatter would change visible date style or
add an unnecessary interface. Architecture: no seam moved.

## Risk and proof

Standard review tier. Reachable failure is an incorrect displayed/exported day
and hour, not a financial computation or persisted contract change. Preserve
negative money proof in the scanner and existing charge/report tests.
Initial local lenses remain debate, test-audit and code-review in distinct
read-only sessions, with the standing same-family independence exception.

Focused tests exercise the rendered invoice, audit, charge and report modules,
plus the report CSV interface and hygiene scanner. UTC fixtures cross Algeria
midnight at `2026-09-30T23:00:00.000Z`, with literal expected date/time text.
Run relevant ESLint and web typecheck. Browser proof uses actual components,
synthetic cache fixtures and clean pinned before/after sources, with screenshots
cropped to each changed element and a real interaction recording. Full local
suites/builds are not routine. Contracts compilation is a required test import
prerequisite only. Full verification remains CI-final.

## Applied lessons and limits

Read the wisdom index and the bare-day range-bound lesson. Its distinction
between a day and an instant applies; range expansion code is unchanged.
The existing invoice-day regression remains intact.
The impeccable product-register reference is absent from the installed skill;
existing source, CSS tokens and DESIGN.md provide the local visual conventions.
No product or financial decision remains unresolved.
