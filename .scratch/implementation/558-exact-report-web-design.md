# Exact report web migration

Base: `fc6d796ab1c9c27b27b18ded712fd9723e0169bb`.
Worktree: `D:/worktrees/tuari_react_hono/t3-e915e71d-f9823f821adb0bd8`.
Mode: focused-local / CI-final-pending. Tier: high assurance because report totals and inventory meaning affect financial decisions. This worker is local-only. Parent owns all three review lenses, architecture assessment, root integration, native/browser proof and hosted gates.

## Interfaces and domain meaning

The report hook calls the published `financialClient.reports.generate` leaf over the existing authenticated `rpcLink`. It uses the exact discriminated output union, not legacy numeric report types. No transport, contract, activation or API source changes belong here.

Date-picker days remain `yyyy-MM-dd` until the hook expands them using the existing date-range helper. Its UTC ISO strings represent inclusive Africa/Algiers bounds: selected day 10 begins on day 9 at 23:00Z; selected day 15 ends at 22:59:59.999Z. This preserves the ISO wire contract, not a particular offset spelling.

Inventory means purchase-entry quantities and purchase locations, not current stock after transfers. UI and CSV say so. Raw `OUTBOUND_SALE` movement counts mix sale, return and gift movements. The existing authoritative `summary.outboundSales` count is labelled accordingly. Separate `outboundDocuments` rows expose SALE/RETURN/GIFT document counts without claiming linkage or valuation.

Money remains canonical decimal strings through CSV. Display uses the existing aggregate exact formatter and isolated LTR currency runs. Counts, quantities and days remain numbers. No snapshots or substitute financial zeros are synthesized. An actual schema-valid empty report displays its authoritative zero amounts.

The hook is an adapter with a small interface hiding date expansion, query lifecycle and typed RPC access. Its deletion would duplicate that behavior in callers. CSV stays local to this existing report module. No speculative adapter or new helper seam is introduced. Shared exact formatting avoids duplicate money logic. Architecture review is scoped to this hook, ReportBuilder and direct consumers, and remains parent-owned.

## Draft chronology and error diagnosis

Imported only the three report source/test paths and this design from the retired draft after inspecting its diff. Original source and evidence remain there. This is draft-first repair, not a claim of original business-red TDD. Earlier stale mocks, install failures and fixture errors are not business reds.

The draft QueryClient default `retry: false` did not override the hook's explicit `retry: 1`. Its assertion timed out at the default retry delay. The new test retains the real one-retry behavior, sets only test retryDelay to zero, holds the initial request pending, rejects it and observes the second rejected RPC plus the actual error UI. Production retries are unchanged. Query clients are cleared after unmount.

## Coverage inventory

Retained and strengthened behaviors:

- Inclusive date-picker interaction, with independent literal UTC ISO expectations instead of calling the production date converter for the expected value. Escape dismisses the picker and returns focus.
- Generated timestamp rendering and all three CSV timestamp headers under a UTC machine, preserving Algeria date and exact existing time text.
- Currency isolation, zero and signed display. Numeric three-decimal fixtures are deliberately replaced because the published exact contract requires two decimal places. This is not equivalent three-decimal contract coverage.
- Gross debt totals do not acquire a misleading receivable direction; the settled phrase remains tested. DEBT and MOVEMENT now both go through the selected mocked published RPC leaf, not CSV-only fixtures.
- Query-enabled behavior, pending/download absence, real error/retry, authoritative empty/download filename, mixed raw outbound labels and separate document counts.

New precision proof uses two wide values differing by one cent beyond safe integer cents, independent literal display/CSV expectations, location rows and wide debtor exports. Schema parsing validates every fixture. The negative mutation temporarily replaces only the asset display formatter with `String(Number(...))`; the wide UI assertion fails, then source is restored before final checks.

These are JSDOM/UI-mock checks, not browser, native, backend-query or actual authenticated network proof. The browser selector returns full scope for an unmapped report test; per the brief no local browser run is authorized. That full acceptance remains CI/parent work.

## Bounded CSV correction after initial review

Correction base: `c8759ead96a8db48cd101bd924e30d6df1bb2fe5`. All three initial lenses completed on that migration head. None established an introduced defect. Code review directly verified one pre-existing P2 defect at the location-label and debtor-name CSV sites: embedded double quotes were not doubled. Both interpolation expressions already existed at the original base. The parent explicitly accepted this small correction before integration; it is not a regression caused by exact money migration.

The exporter now uses one private text encoder only at those two sites. It wraps text in double quotes and doubles embedded double quotes, retaining commas and line breaks inside the quoted field. Monetary strings, numeric columns, headers, metadata, query lifecycle and UI are unchanged. Formula-injection policy and broader CSV structure are outside this correction.

Four new public-exporter cases parse the published schema before exporting. Each site has a pure `North "A"` case with a literal doubled-quote CSV expectation. Additional location and debtor fixtures contain quotes, commas and LF or CRLF respectively. Literal expected row text includes unchanged wide monetary strings and numeric counts/days. Signed and zero summary expectations remain. All prior nine report tests are retained.

These four tests were executed before the production edit and all failed specifically on missing quote doubling. The retained business-red log is `.scratch/reviews/558-web/csv-red.log`. This correction has real red-before-green chronology, separate from the original draft-first migration. Only the hook, report test and this design are changed. Existing dependencies/build outputs are reused without another install or build.

Prior conclusions about exact money, dates, enabled/retry behavior, domain labels, UI states and keyboard semantics remain unchanged claims from the initial pinned reviews. They are not relabelled as current-head verdicts. The parent will obtain one fresh combined-delta review, not repeat all initial lenses. Browser/native/root/hosted acceptance remains outstanding and outside worker authority.

## Wisdom applied and excluded

Applied the dashboard stat-band lesson's no-false-zero rule to pending/error reports. Its historical numeric `toLocaleString` advice is excluded because current exact strings require the shared exact formatter. Read the oRPC session-key lesson; no session cache access or invalidation is changed, so its generated-key prescription does not apply. Existing report query keys and enabled semantics remain unchanged. Financial authentication remains the existing link's responsibility.

Lesson candidate: an explicit hook retry option overrides QueryClient defaults in tests. Retain the configured retry and control its delay to observe actual terminal error state.

## Verification boundary

Affected proof selects ReportBuilder plus direct exact-money/date-range/Algeria-time regression files, WEB typecheck and configured ESLint on the three changed TS/TSX files. Contracts compilation is a necessary published-output prerequisite, not an app build. No full suite, browser run, new package or dependency manifest change. Raw commands, failures, mutation and final SHA fingerprints are kept in ignored `.scratch/reviews/558-web/`. Guard Phase 1 covers named scope and local checks; worker Phase 2 records the committed tree. Independent review and CI acceptance are not claimed.
