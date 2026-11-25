# Manual update runbook

Status: internal readiness guidance. The owner has not selected a release or
approved customer distribution. This document does not authorize an install.

## Supported boundary

The MVP update decision is manual. The desktop exposes update-check and download
commands, but `apply_update` delegates to `FullReplaceStrategy`, whose current
implementation returns `success: false` without replacing files. Do not treat a
successful download, signed package, or UI state as an installed update. In-app
installation remains disabled until trusted signature and payload verification
are enforced in the installed client.

This source-level finding does not prove behavior of a published Windows or
Linux binary. No customer release has been selected, and no exact asset/runtime
binding was established in this readiness slice. Windows binary evidence
remains pending. The two inspected releases have no Linux installer; Linux
availability elsewhere and runtime behavior remain unknown.

## Observed release metadata (2026-11-25)

GitHub listed a beta release (ID `397299741`) with Windows setup and portable
ZIP assets, and a nightly release (ID `457808738`) with the same platform asset
types. Neither inspected release listed a Linux installer. These observations
do not select either release for customers.

The beta tag and release target resolve to
`17911dc14211730bec6982707f518b4c84dafa19`. Nightly's release record points
to that same source, and Nightly workflow run #533 succeeded at that SHA. The
current mutable `nightly` tag instead resolves to
`c253231d4a581a083818d891677c481c143fff23`. Treat this as a tag/source mismatch
for provenance review. The workflow run's Actions artifact list was empty, and
no attestation or exact setup-asset runtime proof was established.

The observed Nightly run is
[45572361803](https://github.com/AmaraNecib/tuari_react_hono/actions/runs/45572361803).
Inspect release records through GitHub's release-ID endpoints, not just moving
tag URLs:

- [Nightly release 457808738](https://api.github.com/repos/AmaraNecib/tuari_react_hono/releases/457808738),
  setup asset `790643910`, 39,802,932 bytes, reported SHA-256
  `c0aff55dada5e00882c7ca84bef590547c08437725c318074f03231632153c7c`.
- [Beta release 397299741](https://api.github.com/repos/AmaraNecib/tuari_react_hono/releases/397299741),
  setup asset `590968029`, 30,080,805 bytes, reported SHA-256
  `7e277de09c2b9e1f14c7e3625b5d38469841960a7befa130011b44938b2e146f`.

These are dated observations, not approved download targets. Neither setup was
downloaded, hashed locally or executed here. Release IDs identify records, not
immutable bytes: uploaded assets can be removed or replaced. Recheck asset ID,
size and digest before relying on them. `target_commitish` is release metadata,
not proof of which source produced the bytes. No raw review report is needed
to follow these references.

The beta release had no matching Beta or Release workflow run in the queried
run records for its source SHA. Do not infer which run built its assets.

## Approved-source gate

Before an installation, obtain the exact release URL, version, and intended
platform from the owner. Use only the owner-approved GitHub release asset or
other explicitly approved authenticated source. A public release page alone is
not owner approval. Do not use moving tags such as `beta` or `nightly` as the
identity of an approved artifact.

Record the release URL, immutable tag or release identifier, asset filename,
size, SHA-256, source commit, workflow run URL and run conclusion. Verify that
the workflow run's source SHA and uploaded artifact correspond to the approved
release. Asset presence and a digest from the same account do not establish
trusted provenance or publisher identity.

## Windows verification and stop conditions

1. Download only the owner-selected Windows installer from the approved source.
2. Compute SHA-256 locally and compare it with the digest obtained through the
   approved release record. A matching digest detects transfer mismatch; it is
   not an independent signature or provenance check.
3. Confirm the release tag, source SHA, workflow run, asset name and version
   agree. Record the evidence before installation.
4. If the owner has not approved the exact artifact, provenance cannot be tied
   to the source commit, the digest differs, or Windows displays a security
   warning, stop and escalate. Never bypass SmartScreen or another operating
   system warning.
5. Complete the data-specific preparation below before upgrading customer data.
   If any required location, backup or recovery detail is unverified, stop.

## Data preparation before an authorized upgrade

This is a preparation checklist, not permission to replace live data. Allow
about 10 minutes to record locations; copying time depends on the data size.
A daily snapshot may predate today's work and is not automatically a complete
pre-upgrade backup.

1. Record the installed version, installation directory, actual active project,
   database path, configured attachment root and backups root. Resolve them
   from the running installation and its configuration, not a guessed default.
   See [backup locations and snapshot scope](backups.md#where). If the active
   data or encryption key requirements cannot be identified, stop.
2. Confirm a complete dated snapshot contains `tuari.sqlite`, `snapshot.json`
   and all database-referenced supported attachments. Preserve that entire
   folder off-device. Referenced inventory purchase and expense attachments
   are covered by current source; arbitrary files and all other owner types
   are not promised. Establish which backup behavior the installed version
   actually provides. Never assume a legacy binary includes current backups.
3. Close Tuari and confirm its API sidecar has stopped before preserving the
   current project and configuration. Keep a separate untouched copy of the
   whole project, attachments and any database `-wal`/`-shm` files together;
   do not copy only a live SQLite main file or delete journal files. Preserve
   the prior installer and identify any needed snapshot-time key through the
   approved secret-custody procedure, never in an evidence log.
4. Document an approved recovery plan for these exact locations and versions.
   The [standalone restore procedure](backups.md#how-to-restore) verifies a
   complete dated snapshot in a new disposable directory. A failed output is
   not usable. Its later live replacement steps are destructive and require
   separate approval; they are not authorized by this checklist. No downgrade
   of a migrated database or automatic rollback is established here.
5. Keep customer installation blocked until the exact-artifact disposable
   upgrade, first launch and data-specific recovery checks have been accepted.
   No such upgrade rehearsal was executed in this slice. Stop if the approved
   plan, complete backup or recovery access is missing.

The completed [restore rehearsal PR #628](https://github.com/AmaraNecib/tuari_react_hono/pull/628)
reviewed head `0300cbf1c2517fc802c97c75186292972ce0ac32` and merged as
`9401180a21ef990fe7f9d5c8e0a43d39db440747`. It checks synthetic invoice-attachment
association, paths, exact bytes and SHA-256 after a standalone snapshot copy.
Reuse that historical result; no repeat was performed here. It does not prove
customer upgrade recovery, expense attachments, every file type, encryption
key recovery, or behavior of a selected published binary.

## Installation and failure boundary

After every approval and evidence gate passes, an authorized operator follows
the selected release's tested installation procedure with Tuari and its sidecar
stopped. Do not invent an in-place upgrade procedure from the fresh-install
instructions. Record the resulting version and data location, then confirm
expected records and supported attachments before resuming customer work.

If installation or first launch fails, stop both application and sidecar,
preserve the failed environment and logs, and keep original backups untouched.
Do not repeatedly launch, reinstall, downgrade or restore over live data.
Escalate to the release owner with the version, artifact digest and failure;
execute only the separately approved data-specific recovery plan. This slice
neither authorizes live restoration nor claims automatic recovery.

The current repository does not establish a trusted production update signing
key or a customer-ready signed installer. The owner must decide release
selection, trust/signing posture and any customer distribution. This runbook
makes none of those decisions.

## Linux

No Linux installer or Linux runtime evidence is established by this runbook.
Do not offer Linux installation until an owner-selected artifact, provenance,
verification procedure and platform runtime evidence exist.
