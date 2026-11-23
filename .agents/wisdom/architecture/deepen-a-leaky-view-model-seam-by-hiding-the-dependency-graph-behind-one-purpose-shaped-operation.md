## Deepen a leaky view-model seam by hiding the dependency graph behind one purpose-shaped operation (💡 Design Principle)

Issue #217: `buildHomeViewDerived`/`HomeViewDerived` was the *intended* single
seam for the dashboard's derived data, but a lazy-loaded page section
(`employees-section`) reached into the internal `home-view-derived-*` modules
to re-derive its own context (`lookups` + `relationshipFacts` + `copy` + `t`)
and build paged rows. Two call paths (dashboard full list vs employees page)
built the same rows from the same workspace, so the seam's promise was broken
and drift was possible.

Fix: **don't relocate the reach-in, hide it.** The seam now computes
`lookups` + `relationshipFacts` once and exposes a single purpose-shaped
operation on the derived object, `buildEmployeeTableRow(employee)`, closed over
that context. The section consumes it as a param and imports no
`home-view-derived-*` module. Extra de-dup: the bulk builder
`buildEmployeeRows` gained an optional `relationshipFacts` param so facts are
computed once, not twice. A **composition test** (importing only the public
seam + the copy builder) pins the invariant `derived.buildEmployeeTableRow(e)`
deep-equals the matching `derived.employeeRows` entry for every employee, so
the two render paths cannot drift, and the test is non-vacuous because it also
pins the exact row count plus the fallback paths (orphan role, inactive/LEFT).

**Always**: when an "export seam" is leaky because consumers re-derive pieces
of its output, deepen it with a function property on the derived value that
hides the internal graph, and test it by composing through the seam only. Name
the public single-row builder for its output type (`buildEmployeeRow` vs the
four-arg internal `buildEmployeeRow` was a Mysterious-Name collision; the seam
method became `buildEmployeeTableRow`, matching `EmployeeTableRow`).
