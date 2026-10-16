# Design pass — #436 (backup-folder setting)

Ran against the finished diff (`git diff HEAD`, plus untracked new modules), per
`docs/engineering-workflow.md` §5. Review tier: Standard.

## domain-modeling

- **Vocabulary**: the setting speaks the engine's words — "backups root" /
  "snapshot" / "retention". The config key `backups_root` and wire field
  `backupsRootPath` are the layer-appropriate spellings of the one concept; the
  environment variable (`APP_BACKUPS_ROOT`) already existed. No new term.
- **Rule stated once**: "a backup failure never blocks startup" remains in the
  service; the validator only guards the *change* action. `docs/backups.md` is
  updated to describe the setting instead of a manual env var, and says what
  happens to old snapshots (they stay; the new folder starts empty).
- Nothing to add to the domain model.

## codebase-design

- **Deletion test**:
  - `backup-folder-persister.ts` + `config-file-writer.ts`: the latter is the
    deep module; the persister is a thin named port over it. The port has a
    production adapter (`config.json`) and a session-only adapter (`null`), and
    a test fake — two adapters, so the seam is justified.
  - `backup.settings.ts` owns the single "is this a usable backups root" rule.
- **Forwarding seam is the existing one**: the diff does not add a Rust command
  or a new env var. It reuses the config file the shell already points the
  sidecar at (`TUARI_CONFIG_FILE`), which the API already reads. That is the
  shallowest correct seam.
- **Duplication removed** (not added): the atomic config write now lives once.

## improve-codebase-architecture

- **Friction**: the config file can be written by two flows (rekey, backup
  folder). They now share one writer, so a future change to the file protocol
  cannot drift between them.
- **Deliberate position**: when no config file is configured, the result is
  `persisted: false` and the UI says so, instead of pretending the choice is
  durable. This is the honest web-build limitation the task asked for.
- **Deliberate position**: a configured root that later becomes invalid degrades
  to a recorded failure (existing service behaviour); the new validator runs
  only on the change action and never on the boot path.
- **Marginal opportunity (not filed)**: same as #439 — a single config-store
  module could own read + write. Not worth touching the rekey path here.

## Result

Nothing found that blocks the merge. No follow-up issues filed.

## Fix round (HEAD `791383dd`)

Re-ran the pass against the review fixes. The validator now proves writability
with a real probe (one rule, one home) instead of a stat that Windows ignores.
The persistence error reason flows through the existing writer result, and the
picker failure surfaces instead of masquerading as Cancel. Both are
deepening-in-place, not new seams. Nothing in the fix round makes the codebase
harder to change.
