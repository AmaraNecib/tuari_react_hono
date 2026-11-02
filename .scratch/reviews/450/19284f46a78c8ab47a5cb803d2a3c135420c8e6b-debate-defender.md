# #477 final independent debate-defender

Source: 19284f46a78c8ab47a5cb803d2a3c135420c8e6b.
Base: 073af118d4f10dd1e7c4099a36a228b2035b00bb.
Tier: High-assurance. Mode: remote. GPT-6 Luna high.
Read-only reviewer; no test rerun.

**Verdict: no actionable implementation blocker. Confidence: 8/10.** The current production files are unchanged from `7b74dff`; this delta adds audit tests and scratch evidence. I reviewed the code and logs read-only, without rerunning tests.

- **Selected-row identity — 9/10.** The contract keeps definition `itemId` separate from optional concrete `optionId` (`packages/contracts/src/inventory.ts:473–484`). The picker sends both and deduplicates by the concrete row (`multi-source-item-picker.tsx:103–129`). The service rereads stock at the source, checks the shared availability rule, then filters to the requested row when `optionId` is supplied (`inventory.service.ts:1169–1213`). The new tests reject missing, foreign-source, and wrong-kind selectors for both item types, with unchanged write snapshots (`outbound-transfer-availability.test.ts:310–349`).

- **Quantity, conservation, and rollback — 8/10.** Decimal helpers avoid scaled-float addition/subtraction and check both the decimal and stored-number delta (`inventory.helpers.ts:75–118`). Outbound allocation validates stock and request remainders before writing; movements use the actual entry ID and consumed amount (`inventory.service.ts:1054–1092`). The whole operation, including debt and transfer writes, runs inside `withTransaction` (`inventory.service.ts:1125–1127`). Tests cover split-stock shortages, late persistence failure, and unrepresentable deductions with before/after snapshots (`outbound-transfer-availability.test.ts:761–849, 908–988, 1186–1227`). I found no defect in these guards.

- **Picker query states — 9/10.** The UI shows errors before loading, and loading before empty stock (`multi-source-item-picker.tsx:209–216`). The audit adds pending/error cases for both definition and source-content queries; the focused log records 7 passing web tests (`multi-source-item-picker.test.tsx:70–82`; `audit-fixes-20261102/focused-web.log`).

- **Evidence and docs — 9/10.** The new design-doc section correctly calls the final delta test-only. Its full-suite counts match the logs: API 1,756 passed/3 skipped and web 970 passed (`audit-fixes-20261102/full-api.log`, `full-web.log`). The note that independent reviews and hosted gates remain is accurate as a gate statement. Once review results are recorded, update that status if the document will be presented as current.

The integer-only picker behavior remains the separately approved scope exclusion, not a blocker. **No code change is warranted from this review.**
