# #558 cash provenance storage

Base: `ca86bed254161b5bc7de561a17855d77f4195345`. Source comparison: preserved `feat/issue-427-independent` at `bb4aa26e64294278b41b530492e28efe2ef7ce51`. Verification mode: focused-local / CI-final-pending. Tier: high-assurance because cash attribution changes debt provenance.

This slice adds isolated exact-schema persistence for cash headers, ordered wage allocations, and explicit advances. It keeps the approved #427 source names and `EARNING`/`OPENING` and `ADVANCE` producer integration points. The cash records hold actual amount, payment date and audit metadata. They store no periods, expected salaries or remaining balances. Exact finance remains authoritative for debt and replay.

The internal repository accepts complete validated source links from a trusted caller. SQL checks earning/opening producer identity against original debt entries, target linkage for payment entries, and advance producer/direction linkage. It does not validate current employee earning rows or add an earning-to-debt link writer; those belong to later orchestration. DDL is opt-in preparation and is not used by startup.

The SQLite adapter uses native int64 bindings and statement-local exact reads. It uses the caller's connection and FIFO through synchronous transaction participation. Header and child writes share one transaction and roll back together. Combined employee lifecycle source/child read limits are checked before hydration. No production route, schema activation, public contract, service, opening provider, replay ledger or root wiring is included.

Vocabulary: a cash header is the actual event; an allocation attributes its wage portion to an existing original and payment entry; an advance records its recoverable cash portion and receivable original. The interface keeps validation and persistence local, but remains a storage seam rather than an orchestration service. Deleting it would scatter exact binding, physical invariants, materialization budgets and rollback handling across future callers.

Applied lessons: immediate synchronous shared-connection transaction discipline and exact-money statement-local reads. Excluded: production schema activation, UI/RPC/auth behavior and replay policy. Architecture: the isolated prepared-schema seam changes; parent owns scoped architecture review.
