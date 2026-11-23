# Task-scoped lessons

Read this index, search for the task's symbols or failure mode, then read only
matching lessons:

```bash
rg -n "<symbol or failure mode>" .agents/wisdom
```

These files record past failures, not additional workflow gates. Current owner
instructions, AGENTS.md, the engineering workflow and relevant skills govern.
Check each lesson's assumptions against current source before applying it.

## Categories

- [Architecture](architecture/README.md)
- [Process](process/README.md)
- [Security](security/README.md)
- [Testing](testing/README.md)
- [Desktop packaging](desktop/README.md)
- [Orchestration](orchestration/README.md)

## Maintain topics, not session diaries

Only the parent writes a lesson after the same failure recurs. Workers name
applied/excluded lessons and report candidates under `Lesson:` in their
commit body. Use `<category>/<lesson>.md`, without dates in filenames.
Update an existing topic and add `Seen in:` references instead of duplicating it.

Keep the failure, boundary and concrete prevention step. Review policy belongs
in the workflow; verification commands belong in guard. Wisdom does not waive
requirements or add another review cycle.

The initial migration preserves every original section, including historical
commands and superseded workflow advice, byte-for-byte in topic files.
Those historical instructions are not current policy. Lossless migration was
checked locally; old full collections remain in Git history and local backups.
Consolidating or retiring stale lessons is a separate reviewed change.
