# Issue 454: shared money renderer and display preference

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/fix-issue-454-independe-f538f59e8f61dade`.
Original inspected and screenshot base: `eb4c16d05fd9ed187b825bdd94b057bfe8073396`. Safely fast-forwarded to `aa4c41a64700c6a4f489ed461e0e1606a73b8ec3` after the owner confirmed PR514; preserved the Windows Rust CI leg and all working source changes. The intervening CI-only merge does not alter the captured UI.
Issue 454 is open with no comments at inspection. The owner expanded scope in this thread: Settings chooses grouped or plain money display. Both retain fractional DZD; integers have no forced `.00`. This supersedes the issue's stale integer-only description and the original exact-format-preservation preference. UI merge approval is still required after evidence.

Writable scope: shared web renderer, existing salary/employee-details callers, appearance settings and local preference persistence, translations, affected tests, this note. No arithmetic, salary semantics, contracts, schema, peer rounding code, CI or access changes.

## Domain and interface

Amounts are numbers in DZD, not integer minor units. Salary proration currently converts DZD to cents internally and returns fractional DZD. The renderer formats only; it never writes amounts. Existing payment display uses up to two fractional digits, the DZD currency precision. Preserve that precision policy and remove integer-only rendering from wages and employee details.

One `MoneyValue` module under `features/shared` owns numeric formatting, signed differences, zero-as-dash and LTR ordering. Presentation variants retain existing table typography and employee-detail spacing/tone. Callers provide the translated currency label. No shared-to-app-shell import is added.

The grouping preference is local to this browser/device, like existing theme/locale preferences. It defaults to grouping (existing salary-table behavior). A small external-store hook synchronizes mounted renderers and Settings immediately and handles cross-tab storage events. It does not require every independently mounted table to add a provider. The appearance control explains that this applies to salaries and employee details, not every unrelated money renderer in the app.

Deletion test: deleting MoneyValue would reintroduce formatting, signs and RTL handling in both views; deleting the preference would duplicate persistence/subscription logic in Settings and the renderer. No new arithmetic or backend seam.

## Verification and reviews

Mode: focused-local / CI-final-enforced, per owner's fresh ruleset 26837184 evidence (strict app 15368 acceptance, no bypass, resolved threads, deletion/non-fast-forward blocked). Local workflow/activation pending wording is historical. Recheck effective protection before any merge; never modify it.

Tier: high-assurance because a money display can hide fractional amounts. Test public renderer output with literal expected strings for zero, sub-thousand, grouping boundary, large values, fractional values in both modes, signs, dash and LTR. Test preference persistence, live updates and Settings interaction; affected caller and decimal-entry tests remain in scope. Use selector-selected browser cases and real synthetic-data interactions, with pinned before/after locator captures. Full suites/builds are CI-final except contracts compilation needed to execute affected imports. Preserve exact-SHA logs and failures locally, never commit reports.

The selector returns full scope because the Arabic resource file is a critical path. CI must honor that full selection. Locally, the changed translations only add Settings labels; the three salary browser cases exercise both changed views, real decimal payment entry, settings selection, keyboard selection and reload persistence. No local full-browser expansion is justified by these additive keys. Contracts compilation is a necessary imported-package prerequisite and was run by the existing browser server launcher.

Run distinct initial debate, test-audit and code-review sessions at the committed source-owning tree; freeze source while they read. Bounded fixes get one fresh combined-delta review. Same-family separate-session review uses standing owner approval if no enabled alternative family. Parent assesses changed seams only. Publish authorized PR, link/watch, request Greptile once per head; require current-head 5/5, CI acceptance and resolved findings. Ask owner for explicit UI merge approval with actual evidence.

## Bounded hosted-review correction

Greptile at a011455d identified a reachable quota failure: localStorage.setItem throws before notifying mounted views. Retain a session-only grouping override on failed writes and catch denied reads; still attempt persistence on each later selection. Successful writes clear the override. Relevant cross-tab storage updates clear it so the latest shared setting wins. No new UI or financial policy is introduced. Regression tests simulate QuotaExceededError and SecurityError and assert actual Settings/renderer updates, remount retention and recovery. Normal stored/default behavior remains covered.

Safely integrated owner-confirmed PR515 / issue480 at31430a1bf426bd25c70ef676b606a90ec2bebad6 through a normal merge (494e701c), preserving existing local corrections. Its shared rounding extraction is upstream source, not modified here. Since salary-days is an imported dependency of affected forms, refresh focused salary/rounding and browser proof after compiling contracts. Carry unchanged renderer/layout conclusions forward; one fresh combined-delta review covers the persistence correction and this integration.

## Wisdom

Applied: deterministic money strings require an explicit locale and literal expectations. The historical ar-DZ display recommendation does not match current en-US salary/detail rendering, so preserve Latin digits here. Employee UI creation limitations inform synthetic database fixtures. Money-bound and allocation lessons are outside this display-only scope; no validators or allocation code change.
