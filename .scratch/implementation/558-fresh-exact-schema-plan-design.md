# Fresh exact schema plan

## Scope and risk

Base: `ee5599006c61beb7da4005d1ce36fec2c94aa99c` in `D:/worktrees/tuari_react_hono/t3-4a572870-a15d13a19eadf9d3`.

This is a high-assurance, focused-local / CI-final-pending DDL composition plan. It does not select or run startup initialization. The parent owns existing-database attestation, reopen behavior, shared nonfinancial seeding, and root wiring. The plan never runs additive migrations or a legacy monetary DDL statement.

## Interface and ownership

`freshExactSchemaPlan` is a readonly ordered list of SQL statements. `freshExactSchemaOwnership` reports exact-owned tables, replaced base tables, and retired legacy payroll tables.

The plan keeps each current `schemaStatements` table unless one of the exact DDL slices creates the same table. It also keeps base indexes/triggers whose target table is not replaced or retired. It composes exact debt, invoice, inventory, expense, payroll cash, and payroll offset statements. A single marker table precedes the slice-specific marker inserts. Current `employee_earning` and `employee_earning_segment` stay sourced from `schemaStatements`.

DDL recognition is deliberately narrow. An unfamiliar current statement throws during module initialization instead of disappearing from the plan. The composition test executes every planned statement inside a native `BEGIN IMMEDIATE` transaction on a temporary database file, then checks exact columns, markers, foreign keys, retired tables, and rollback on a bad final statement.

## Domain terms

A fresh exact schema means new exact physical money columns and producer-linked payroll tables. It does not mean converting an existing database. Employee earnings and segments remain the current source identities; payroll cash, advance, settlement, and offset tables record payment provenance.

## Design checks

The plan is a narrow module with one output and no database side effects. Removing it restores no behavior outside its caller because the parent has not wired it into startup. There is one planned consumer, the future initializer, so this module does not introduce a runtime adapter seam.

Applied wisdom: reserve the write transaction with `BEGIN IMMEDIATE` before executing schema statements; test the real SQLite schema because mocks cannot catch native SQL failures; do not run migrations inside a root/schema-less test seam. Excluded: transaction-bearing service guidance unrelated to this pure plan, and unrelated money rounding guidance.

## Evidence boundary

The native tests establish that the selected statements compose on a fresh plain SQLite file, carry the five exact marker versions, preserve current earning tables, omit legacy payroll tables, satisfy foreign keys, and roll back as one transaction. They do not establish auth/RBAC seed readiness, schema attestation for reopen, startup idempotence, integration with configured application databases, or production root acceptance. The keyed SQLite driver was not installed in this worktree.
