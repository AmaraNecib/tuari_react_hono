## Reset effects must key on every input their defaults depend on, and track edits per field (🟠 Major)

On #412 round 3, `AddSalaryPaymentDialog`'s reset effect guarded on the employee
id alone. A workspace refresh that changed the worker's wage period
(monthly→daily) while the dialog was open re-ran the effect but returned early,
leaving an untouched days field at 30 while the daily proposal used the new
wage; accepting it recorded 30 days of daily pay. The employee-details quick
form had the mirror gap: it re-applied the default but also reset touched fields
and collapsed the form on any wage refresh.

**Always**: an "initialize this form for this record" effect must key on
*everything the default derives from* — the entity id AND the fields that feed
the default — not the entity id alone. Pair it with per-field touched flags so a
same-entity refresh re-applies defaults to untouched fields but never clobbers
an operator edit, and split "different entity" (full reset) from "same entity
refreshed" (partial re-derive). A shared default helper
(`defaultSalaryPaymentDays`) is not enough if the effect that applies it is keyed
wrongly.

**Testing**: re-query the live DOM after the simulated refresh, don't hold the
pre-refresh node. A reset that unmounts/collapses the form leaves the detached
node's old value intact, so a captured-reference assertion passes on the buggy
code; asserting the form is still open (its submit button present) plus a fresh
`getAllByRole` query is what actually catches the clobber.

