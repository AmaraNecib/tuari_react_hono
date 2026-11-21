# Purchase history destinations

## Authority and scope

Owner-approved bounded correction in PR #579. Base `6587e466cdc5913c28777362740a0270ffb8fe6d`; exclusive worktree `D:/worktrees/tuari_react_hono/t3-b6fcd388-0b7b61104c0ab52d`. Initially clean. Mode `focused-local / CI-final-pending`, high assurance because incorrect destinations misrepresent stock and invoice money. Parent owns fresh combined review, integration with `60403e9d`, browser proof and hosted acceptance. No publication or child agents here.

## Domain and interface

A purchase invoice has one financial identity and multiple saved entries. An invoice default is only a write-time fallback, not historical evidence of where each entry was received. Entry destination is the saved typed warehouse/project reference. Equal IDs with different types are different places.

The optional nullable `items[].to` contract preserves absent legacy fields. A global purchase row has its common destination only when every entry shares the same typed place; mixed or unknown destinations yield null. Each item carries its actual saved destination. Filtering by location or type selects entries before rendering, with the filtered common destination on the row. No destination is inferred from an invoice default.

Total, paid and remaining always refer to the complete invoice, even when visible quantities are a subset. Full-filter summary counts each matched invoice once and sums its whole amount once, before paging. Both mounted history renderers disclose this meaning. No proportional allocation, second ledger, writer or schema change.

## Implementation and architecture

The existing transfer-history service remains the filtering/paging seam. Memory and native candidate adapters carry saved entry destinations as lightweight operands alongside existing item names. The common-destination helper compares type and ID. Candidate filtering and search occur before stable paging; display hydration reads entries only for selected invoices. Financial graph reads are unchanged. The native candidate query reads no per-item financial graph.

The web hook exports the contract row type instead of duplicating it. This prevents optional destination fields from disappearing at the renderer interface. The existing query hooks and invalidation keys remain intact. Deleting this history module would duplicate candidate selection, typed-place equality and money scope across location and global callers; those rules belong here. No new module seam or generic abstraction is introduced.

## Proof and limits

Approved test seams are the transfer-history service with memory/plain/keyed adapters, contract parsing, existing hooks and both mounted renderers. Red-first service proof catches the original default-A/actual-B error in all three adapters. Red-first mounted proof catches absent disclosure and item destination links. Focused checks include mixed A/B, typed collisions, quantities, whole amounts, full-filter totals beyond visible pages, type/search/date/paging regressions, provenance, broken outbound links and no added ledger reads.

Contract generation writes only this tree's ignored dist. Absent dependency directories are populated with read-only dependency junctions; local @tuari/contracts resolves this tree, never parent dist. Initial setup attempt encountered a non-directory metadata file; retry linked directories only. No package addition. Early native tests used the environment default temp directory; final verification explicitly routes TEMP/TMP to D. All failed attempts remain local.

No full suite, browser, production build, schema, form or payroll changes. Contracts compilation is the affected tests' prerequisite and uses the heavy queue. Final checks, exact source fingerprints and failure boundaries live under ignored `.scratch/reviews/579-destinations-sol/`. Review and integration proof remain parent-owned.

## Summary disclosure correction

The partial review identified a valid P2: row disclosure alone does not explain whole-invoice purchase amounts in the global summary. Show a translated notice beside the summary whenever the selected transfer type permits purchases. Do not infer this from visible rows: a purchase may contribute beyond the current page. A mounted regression with no visible rows and a full-filter total first failed (3 passed, 1 failed). The notice changes no monetary calculation. Complete independent review remains required; the partial report is not acceptance.

## Wisdom

Applied aggregate-read lesson: retain granular hooks and existing invalidation vocabulary. Applied location-history design: retain per-item quantities and typed direction rather than summing incompatible units. Exact aggregate bounds remain wide and unchanged; no narrowing or monetary allocation is introduced. Ownership-history helper duplication lesson does not justify unrelated adapter refactoring here. No repeated-lesson candidate.
