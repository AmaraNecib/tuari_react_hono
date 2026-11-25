# Issue 393 manual-update readiness

## Scope and authority

Base: `15c0e754165a3b7591c013edf85fe288b5b492a4`. Verification mode:
focused-local / CI-final-enforced, as supplied by the coordinator. This is a
docs-only readiness slice for Windows manual updates. It does not implement an
updater, select a release or signing policy, authorize distribution, activate
release workflows, or close issue 393.

## Findings

- `apps/desktop/src-tauri/src/lib.rs` routes `apply_update` through
  `FullReplaceStrategy`.
- `apps/desktop/src-tauri/src/update.rs` returns `success: false` from that
  strategy without replacing files. This is source evidence, not proof about a
  shipped binary.
- Release documentation previously instructed users to bypass SmartScreen.
  It now instructs users to stop and escalate.
- GitHub listed Windows setup and portable assets for beta and nightly, but no
  Linux installer in either inspected release. Nightly run #533 succeeded at
  `17911dc14211730bec6982707f518b4c84dafa19`; the current nightly tag points
  elsewhere. No exact published setup-asset runtime proof or attestation was
  established. See `.scratch/reviews/393/evidence.md`.

## Changes

- `docs/release.md` removes the SmartScreen bypass advice and links the
  manual-update procedure.
- `docs/manual-update-runbook.md` defines the source/provenance checks, stop
  conditions and owner-only release gates without selecting an asset.

## Verification

Read-only GitHub metadata queries and PR #628 metadata are recorded in
`.scratch/reviews/393/evidence.md`; no downloads or installs occurred. The
metadata inspection did not capture command durations or raw response files.
Before committing this update, run `git diff --check` and `pnpm check:unslop`.
Do not run a full build or repeat the restore rehearsal. Record exact-head
results in `.scratch/reviews/393/`.

## Review and wisdom

The manager owns the three initial review lenses after this scope is committed.
Applied: desktop packaging lesson index consulted; no lesson changes source
claims or authorizes bypassing OS warnings. Excluded: restore-rehearsal
execution, because the supplied instruction identifies merged PR #628 evidence
and prohibits rerunning it for another report. Architecture: no code seam
moved; this change is documentation only.
