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
The manager preserved a separate metadata recapture under ignored
`.scratch/reviews/393/manager-metadata/`, including raw API responses, native
exit codes, timestamps and durations. This does not retroactively complete the
worker's original logs. Queries returned release IDs, asset IDs/digests and
run metadata; no exact-asset provenance or runtime claim follows from them.
Run `git diff --check` and `pnpm check:unslop` for the documentation delta.
Do not run a full build or repeat the restore rehearsal. Record exact-head
results in `.scratch/reviews/393/`.

## Review and wisdom

Three distinct initial lenses reviewed `156005abb2e154fc05a311ce3d4ee4aa6b03a0d7`.
Their actionable findings required removal of the beta customer recommendation,
gating the existing installer execution instructions, an explicit data-specific
backup/recovery stop gate, and durable references instead of an ignored report
link. The bounded correction addresses those findings. It does not turn the
historical restore rehearsal into customer-upgrade proof. A fresh combined-delta
review is required before local readiness. Release selection, signing posture,
exact shipped-binary behavior and customer distribution remain pending.
Applied: desktop packaging lesson index consulted; no lesson changes source
claims or authorizes bypassing OS warnings. Excluded: restore-rehearsal
execution, because the supplied instruction identifies merged PR #628 evidence
and prohibits rerunning it for another report. Architecture: no code seam
moved; this change is documentation only.
