# Resolve hosted approval conflicts and search isolation findings

Base: `bee107fcd39cffba9e346b8a873dbbe086cfeea3`.
Verification mode: `focused-local / CI-final-pending`.
The published head `0bcaad8a` received a Greptile score of 2/5. Its inline findings are `4594682126`, `4594682133`, `4594682137` and `4594682144`.

The salary test's missing Web Locks fixture is already corrected in `bee107fc`; production still refuses sends when coordination is unavailable. The initial local debate found no findings. Code review found that exact search could include cached legacy financial data. Test audit requested regressions for that exclusion and workspace/user cache isolation. This correction addresses those findings and the remaining hosted cases. It does not request another hosted review of the same head.

## Conflicting approval intents

When the executor finds a different durable record under the identity lock, it retains that record so the pending fence survives. It retires the obsolete executor and throws `MonthlyApprovalRetiredError` with reload guidance. The form remains locked, disables submission and shows its existing reload control without generic retry instructions. While the foreign durable intent remains, the shell receives an uncertain state rather than idle.

Repeated calls remain refused even after the other tab clears its record. The overlapping-executor regression checks retirement, no dispatch and repeated refusal before and after that clear. The form regression creates a competing record after mounting, then checks reload-only behavior, no RPC and preservation of the competing record. Storage keys, envelopes, receipt fingerprints, schema and contracts are unchanged.

## Exact search corpus isolation

Disabled legacy TanStack queries retain cached data. Exact search now excludes legacy debt, external-counterparty, inventory-item and invoice entities from its corpus, not just their fetches. Existing page categories and scoped employee, project and warehouse references remain.

The focused shell-boundary test supplies retained legacy rows even when queries receive `enabled: false`. It checks lazy exact reads and exclusion of every legacy entity family. It then changes workspace and user identities within the same QueryClient and verifies that old results disappear and the new scoped keys receive data. Modal and debounce mechanics are mocked only in this data-boundary test; the real-root test and browser cases exercise the production dialog and navigation.

Initial test fixtures had tour-modal and debounce interference, recorded in isolation logs 01–06. The corrected fixture skips the installed tour and isolates the corpus boundary. Temporarily restoring legacy inclusion made `exact-global-isolation-red-08.log` fail; the safe production source was restored in `finally`. Initial warehouse fixtures also omitted fields required by the contract; complete typed fields replaced them without casts.

The combined review of `d535c904` found no production leak but requested cached external-counterparty and invoice fixtures as well. Both now have distinct forbidden labels and explicit absence assertions. The same review requested ordinary spacing in this note; it has been rewritten rather than retaining compressed prose.

## Browser test state

The salary translation smoke asserts the always-rendered labelled worker selector instead of assuming the employee database is empty. Heading and raw-key checks remain. Browser verification runs employee search first so 55 seeded employees remain for the translation case.

Only the warehouse manager-selection case depends on direct database fixtures. Its per-case external-mode guard runs before setup. Warehouse creation and capability-boundary cases remain runnable against external servers. No blanket skip, CI split, threshold change, dependency or runtime licensing fallback is introduced.

## Proof and remaining gates

At `d535c904`, five affected web files passed 41 tests in 21.56 seconds; see `hosted-correction-green-02.log`. Full web typecheck, affected lint and strict changed-E2E TypeScript checks passed. The managed browser selection covering employee search, translations, global search and warehouses passed with an owned disposable database on API port 4418 and web port 3100; see `hosted-regressions-01.log`.

The extended corpus regression passed in 6.09 seconds; see `cached-families-green-01.log`. Full web typecheck and focused lint passed. Separate mutation checks reintroduced only external entities, then only invoice entities; each made the test fail. Logs are `cached-externals-mutation-red-01.log` and `cached-invoices-mutation-red-01.log`. Production source was restored in `finally` after each check. There is no external-server browser execution or full-suite acceptance claim. The owner's native data and port 4318 remain untouched. A fresh bounded review must carry forward resolved findings and inspect the new fixtures. CI-final acceptance is pending. The owner prohibits merge and auto-merge even with green checks and a 5/5 verdict.
