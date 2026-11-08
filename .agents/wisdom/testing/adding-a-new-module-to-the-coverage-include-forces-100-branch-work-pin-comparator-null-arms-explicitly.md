## Adding a new module to the coverage include forces 100% branch work: pin comparator null-arms explicitly (🟠 Major)

On #411, the new `src/modules/expenses/**` module was added to the API vitest
coverage include (the repo convention for new modules), which turns every
branch in the module into a gate. Two traps surfaced:

1. A `sort` comparator's `if (a.projectId === null) return 1` arm never fired
   even though the untagged group existed: the group array is built in
   expense-date order, so whether the untagged group is compared as `a` or `b`
   depends on its insertion position. A dedicated "untagged is the oldest row"
   test pinned the arm; without it the coverage run was red on a line the
   existing group tests appeared to cover.
2. One-line ternaries (`input.note === undefined ? existing.note : input.note`)
   each need BOTH arms exercised; one update test that passes every optional
   field plus one that omits them is the cheapest complete pin.

**Always**: when adding a module to the coverage include, read the coverage
report's branch list, not just the line list, and add the discriminating test
for each arm (ordering arms need an input that puts the special element first).

