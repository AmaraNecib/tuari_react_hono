## In-memory test doubles cannot see adapter-level SQL type errors: bindable SQL params need schema .int() (🟠 Major)

On #289, the test-audit edge-case hunter empirically found that
`paymentListLimitSchema` (no `.int()`) accepted `limit: 2.5`, and the sqlite
adapter then bound it as `LIMIT ?` → better-sqlite3 throws
`SqliteError: datatype mismatch` → wire-reachable 500. The in-memory adapter
only compares `items.length > 2.5` and coerces nothing, so the module-seam
suite was green the whole time. The crash reproduced ONLY on the real sqlite
adapter. Fix: `.int()` on the shared limit schema (closed at wire + seam) +
a module-seam test that still passes on in-memory because the schema rejects
first.

**Always**: when a number from a validation schema becomes a SQL bind
parameter (LIMIT, OFFSET, indexes), enforce `.int()` on the schema. The
in-memory double cannot reproduce the adapter's SQL-level type rejection, so
the failure hides until the real adapter runs. Also: run at least one
validation test against the REAL adapter (not just the double) for any value
that reaches SQL.

