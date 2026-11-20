# Asset charge history read

Original base 65c4755b96332ffad27612a589fdf1c838726c70. Invoice dependency 381b7c1ec4cbe0f8e1d8a0d8f06acecdb89aeb63 cherry-picked as 05a9c377. Tree D:/worktrees/tuari_react_hono/t3-325c5784-5ae51d0de1304d55. High assurance, focused-local / CI-final-pending. Parent owns independent review and publication.

Recovered the seven-file Luna draft through a saved binary diff without modifying the retired tree. Fixed its native keyed/plain null lookup: boundedIds already returns string IDs, but the draft destructured each string as an object before getCharge. Missing selected charges now fail rather than disappear. The pinned better-sqlite3 lifecycle restored the missing plain binding. No dependency changes.

The authenticated financial.inventory.assetHistory input is { assetUnitId: string }; output is { assetUnitId: string, items: ExactInventoryCharge[] }. Existing queryAuth and error resolution apply. Asset existence is checked before the scoped read. LIVE and VOID charges retain exact amounts, descending placementSequence, ascending revisions and stored audit metadata. The existing default-charge read shares the scoped lookup, retaining its existing purchase-price default behavior only there.

Native SQL selects IDs WHERE asset_unit_id=? ORDER BY placement_sequence DESC, with the existing explicit 100000 resource bound. Hydration reuses getCharge and authoritative schemas. No writes, new schema, accounting rules or stock UI changes. Deleting the adapter leaves one purpose-shaped repository read rather than a caller-owned full charge scan.

Proof: new public-service chain case is red on the recovered draft, then green in memory, plain and keyed storage. Full affected service file has 56 passing tests. Native router file has 2 passing cases including anonymous refusal and missing asset. Raw chronology is local in .scratch/reviews/579-recovery. Committed-head checks are recorded separately.

Wisdom applied: scoped query ownership and exact-tree evidence freshness. Existing date/filter lessons remain relevant to the following pagination work; no new wisdom is written by this worker. Review and hosted acceptance remain pending.
