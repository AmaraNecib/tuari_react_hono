# Approved invoice browser contract migration

## Revision and authority

Own tree D:/worktrees/tuari_react_hono/t3-faac3f38-f3c5f957ae510e09.
Original lane head402ee080ed70c1dadc265ed2d818771cc733260b. A clean local merge
of approved parentb25c5b75bf7c410c1e3b9dd97115c9a9d885de3c produced effective
basefb6701871a35623ceee6770d494fc85a9a7ee1b3 without conflicts. This is dependent
local integration, not a remote update. Parent source is untouched.
Mode focused-local / CI-final-pending. High-assurance bounded test migration.
Parent owns fresh combined review and actual browser/hosted gates.

Only the two invoice E2E specs and this design may change. No production,
backend/schema, shared helper, lifecycle, dependency or configuration edit.
Read the approved mapping at C:/Users/sensei57/AppData/Local/Temp/579-union-b25c5b75-20261121-015439-984/invoice-browser-mapping.md.

## Owner disposition, verbatim scope

"keep current direct definition selection and minimumone-line behavior with meaningful disabled-save reason; DEFER initialpaymentmethod CASH/BANK/CHECK to separateissue591 https://github.com/AmaraNecib/tuari_react_hono/issues/591, distinctfrom existingAMOUNT/PERCENT; RESTORE dedicatedinvoicebackbutton and visiblepurchasemovementhistory using existingexactresponse. Percentage559stillseparate."

This explicitly supersedes the old type-gate/missing-type/zero-lines presentation
expectations, not financial detection. The tests now assert one nonremovable
initial line, actual direct item selection, invalid-price disabled Save with
linked accessible reason, valid-price enablement, add/remove back to one line,
and unsupported-file name/reason retained after the Notes section closes.
The only removed payment-method assertion belongs to deferred issue591.
AMOUNT remains explicitly checked as an initial-payment input mode, never as
CASH/BANK/CHECK equivalence. No percentage559 model/UI/calculation is added.

Back-button and movement-history assertions remain required. The production
restoration is assigned separately. Parent relayed the production author's implemented but not yet committed/green
interface: button العودة إلى الفواتير; labelled region سجل الحركات with per-movement
articles, owned-item h4, literal شراء, directional exact quantity and typed warehouse.
Tests discriminate entry h3 from history h4, scope each article by item/quantity/
destination and require visibility. The dedicated back action from the detail alias calls goToInvoices. The first
migration incorrectly inferred that /invoices renders الفواتير والدفعات from a
standalone component name instead of following the actual HomeView case. Browser
execution at e10fa1f4 disproved that claim: /invoices mounts ExactInventoryPage,
heading المخزون والمشتريات and the inventory-purchase table. The bounded
correction below fixes this test provenance error, not production navigation.
The tests must remain blocked if those required surfaces are absent. Their
compiler pass cannot establish rendering or implementation completion.

## Acceptance-preserving scenarios

Each spec retains three serial cases with real authenticated catalog, warehouse
and party UI setup. No prerequisite financial data is faked or seeded around
those behaviors; managed stop-before-fresh-file lifecycle is unchanged.

Header/default scenario uses the fixture-named native typed destination select,
asserting selected value and selected option text before and after line addition.
An alternate warehouse is created through UI to discriminate explicit line
placement from header inheritance. Change the header and require the explicit
line to stay on the alternate warehouse; then clear that override and require
both lines to inherit the header at persistence. Two1×1 lines have known total
2.00, exact gross200 minor units, precisely two entries and warehouse/nonproject
XOR. This strengthens the existing inheritance proof without dropping the two
unset-line assertion. No selected-value assertion reads all option text as if
it proved the chosen value.

Progressive scenario verifies number/date/direct item and quantity visible,
all four disclosures collapsed with controls unmounted, then all four expanded
through a line-add rerender. Debt checkbox, explicit party/supplier, typed default,
500 initial amount, note and selected image persist. Both10×100 lines independently
yield2000 gross,500 paid,1500 remaining. Read-only SQL binds a unique invoice
number/group, casts exact INTEGER money to text and expects200000/50000/150000.
Both entries must inherit warehouse with null project, supplier must equal the
selected party's name/ID, and exactly one invoice-note.png attachment must belong
to that same group. Actual returned and remounted detail must show the named
items/attachment, back control and purchase movements with exact×10 quantities.

The previous latest-row queries and numeric retired DZD columns are replaced
by owned invoice identity, entry_order and exact minor-unit strings. query_only
and finally-close remain. Detail proof follows the actual inventory group ID,
never a generic invoice ID, and retains data-dependent content and explicit
back/history behavior instead of a broad page-visible check.

## Proof and architecture

At D~64MB no browser, server, install, restore, build, new worktree or cleanup is
authorized. Saved compiler/scripts/cache/raw logs use unique C TEMP. Run focused
TypeScript over only the two changed specs and their imports, with explicit
existing own Node type roots because the config is outside the repository.
Preserve source fingerprints and native exits, commit only complete bounded
scope and report browser as unrun. No syntactic check is called runtime parity.

Source interfaces checked: actual purchase form/disclosure component, exact
purchase route and detail ownership, exact group/entry schema and repository,
attachment contract/renderer, current labels and legacy picker assumptions.
Browser UI and read-only persistence remain the existing seams; no new runtime
interface is introduced. Historical group identity and current typed placement
are distinct facts. Existing API/contracts unchanged proof is carried honestly,
not replayed as this lane's native execution. Parent fresh review is required.

## Bounded selectors after the real nine-case run

The parent authorized this two-selector correction after preserving the complete
native1 execution at e10fa1f4: six passed, two failed, one serial-blocked, zero
retries. All three debt cases passed and must not be rerun merely for a new label.
Original traces/results remain under C:/Users/sensei57/AppData/Local/Temp/579-final-union-e10fa1f4-20261121-024325-165/browser-20261121-025021-682.

A clean local merge of e10fa1f4a070121e194dde66197332f87e9663eb into own
54a1d4d06596f0513beae087f2c709a24e16efb1 produced effective base
bf8a45f1d5bc1f5cbb37b4c46554728cdb997700 without conflicts. Actual restoration
markup is now in this tree. Parent remains untouched and frozen during edits.

Back click and URL were already successful. Replace only the wrong destination
heading with the actual canonical list heading and a unique visible row whose
exact cell is this invoice number. Require its owned detail action, no lingering
detail heading/history region and no editor. All earlier purchase placement,
SQL and history assertions remain unchanged.

The note failure was an exact getByLabel text mismatch, not observed draft loss.
Saved snapshot shows the actual textbox name and retained value. Trace DOM after
the successful fill contains the controlled TEXTAREA value as descendant text
inside its wrapping LABEL. Installed Playwright1.58.2 getElementLabels delegates
to elementText, which recursively includes that descendant text when matching
label text. Exact label text therefore changes although the accessible textbox
name remains ملاحظة. Use the actual Notes region's exact textbox role/name;
assert the typed value before and after adding a line and require its region
visible. Final group SQL note equality remains unchanged. No production ARIA
change is needed or claimed. A small C-only DOM probe may demonstrate this
matcher behavior; it is not a browser result or a replacement for the future
six-case invoice run.

Only the two specs and this minimal design correction change. Keep normal hooks,
focused compiler and exact source fingerprints; no new skips, waits, retries,
helper refactor or production edit. Browser remains unrun for the correction
until parent fresh bounded review and clean integration. Existing issue591 and
559 scope and all owner-accepted financial/presentation obligations persist.
