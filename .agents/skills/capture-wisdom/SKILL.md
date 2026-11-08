---
name: capture-wisdom
description: "Read task-scoped lessons and maintain topic-based wisdom. Workers read and report candidates; only the parent writes repeated lessons."
---

# Capture wisdom

Read `.agents/wisdom/README.md`, search for the task's symbols or failure mode,
then read matching lessons. Check their assumptions against current source.
A historical success does not prove today's cause.

Only the parent writes lessons, after the same failure recurs. Workers report
applied and deliberately excluded lessons in their commit body, with candidate
lessons under `Lesson:`. One occurrence is a report, not a new wisdom file.

Use `.agents/wisdom/<category>/<lesson>.md`, without dates in filenames.
Update an existing topic when it recurs and add `Seen in:` references. Preserve
the failure boundary and a concrete prevention step. Remove obsolete commands
and duplicated workflow policy only with a documented reason.

Current rules live in the engineering workflow and guard.
Wisdom does not add a second review cycle or waive a current gate.
Use the index to discover topics; do not read every lesson on every task.
