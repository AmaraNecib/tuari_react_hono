# Slice 543 reopen safeguards

## Scope

Base: `457d94fbd1e9be41b927da792e12b47387301c8b`. Verification mode: focused-local / CI-final-enforced. This is one bounded correction to the two accepted P2 schema findings. It does not change schema version, create a migration, repair a database, or activate later payroll tables.

## Decision

`ensureExactNormalWorkspaceSchema` remains the startup seam. Fresh-schema DDL stays the authority. On reopen, validation now checks an explicit application-table inventory and compares the `sqlite_master` definitions for employee/profile history, earnings, and debt tables with the approved DDL already used for fresh creation. It also compares the corresponding debt and earnings indexes and triggers, plus the normal-root reference indexes.

The SQL comparison collapses whitespace outside quoted values and removes only a leading `IF NOT EXISTS`. It preserves string-literal contents, constraint expressions, foreign-key clauses, index predicates, and trigger bodies. SQLite's own `sqlite_%` tables stay outside the application inventory. An unrecognized application table, including `employee_salary_payment_allocation`, fails closed.

Validation reports drift. It does not recreate missing objects or change the schema marker. The allowed table list includes the exact root's auth, reference, identity, employee, debt, and earnings tables. The root still uses its configured native connection.

## Proof

The schema tests cover fresh creation and idempotent reopen, the deferred allocation table, missing and no-op earning guards, missing immutable update/delete guards, segment uniqueness/FK/check drift, and debt constraint/index drift. A normal-root test runs against disposable native plain and keyed SQLite files and confirms deferred-table and no-op-trigger drift refuse startup without changing `sqlite_master`, the marker, or seeded role rows. Existing valid plain/keyed root reopen and backup tests remain green.

Architecture: no new runtime interface or connection. The schema validator remains local to the normal exact workspace module.