# Design pass — #439 (backup status surface)

Ran against the finished diff (`git diff HEAD`, plus untracked new modules), per
`docs/engineering-workflow.md` §5. Review tier: Standard.

## domain-modeling

- **Vocabulary**: the diff extends the existing backup vocabulary — "backups
  root", "snapshot", "retention", "last successful backup", "failure". The new
  wire fields (`backupsRootPath`, `retention`) and config key (`backups_root`)
  name the same concepts the engine and `docs/backups.md` already use; no new
  term needs `CONTEXT.md`.
- **Rule stated once**: the retention numbers are still stated only in
  `BACKUP_RETENTION`. The diff surfaces them through the service's injected
  `policy` rather than re-declaring them in the contract or UI. The "usable
  snapshot" rule stays in the service.
- Nothing to add to the domain model.

## codebase-design

- **Deletion test**:
  - `config-file-writer.ts` (new) is deep: one read-modify-write + schema guard
    + atomic durable write. It has two real callers (DB-key persister, backup
    persister) and removes ~60 duplicated lines from the key persister. Removing
    it would force the protocol to be copied again — it earns its module.
  - `backup.settings.ts` validator is the single home of the "usable folder
    path" rule; the handler and its tests use it as the interface.
  - `BackupFolderPersister` is a port with a production adapter and test fakes,
    so the seam is real, not hypothetical.
- **Interface as test surface**: `BackupService.setBackupsRoot` is exercised
  directly by a service test (no fs/HTTP), and the path validator by its own
  unit test. Good.
- **Duplication removed**: the router test harness had a duplicate
  `backupService` object key (the second silently won). Removed in this diff.
- No finding requiring new issues.

## improve-codebase-architecture

- **Friction created**: none material. The service gained one mutation
  (`setBackupsRoot`) that owns the root it already owned; the handler stays a
  thin validate → persist → apply.
- **Deliberate position**: after a successful `setBackupsRoot`, the status is
  re-seeded from the new root, so a failure tied to the *old* folder no longer
  shows. This is honest — changing the folder is a deliberate act and the new
  folder genuinely has no backups yet. A *failed persistence* never reaches
  this branch, so a real failure is not lost.
- **Marginal opportunity (not filed)**: the config-file loader (read) and the
  writer (write) could become one config-store module. The extraction already
  puts the write protocol in one place, and folding the loader in would touch
  the rekey path for no user-visible gain. Left as-is.

## Result

Nothing found that blocks the merge. No follow-up issues filed.

## Fix round (HEAD `791383dd`)

Re-ran the pass against the review fixes. The run root is now pinned for the
duration of a run, which makes the "one folder per run" rule explicit rather
than implied by the mutable variable. The writability probe and the
session-only/future/prune copy changes keep the honesty rules in one place
(the component and the i18n file). No new module, no new seam. The writer is
still the single write protocol; the dedicated `config-file-writer.test.ts`
pins its interface instead of leaving the protocol covered only through a
consumer. Nothing in the fix round makes the codebase harder to change.
