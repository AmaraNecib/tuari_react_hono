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
Linux binary. No matching release artifact has been selected and tied to a
workflow run in this readiness slice. Windows binary evidence remains pending.
Linux asset availability and runtime behavior remain unknown; do not infer
support from Windows packaging or source.

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
5. Confirm a recent backup and a tested recovery path before upgrading
   customer data. Use the existing restore rehearsal evidence; do not repeat it
   merely to obtain another report.

The current repository does not establish a trusted production update signing
key or a customer-ready signed installer. The owner must decide release
selection, trust/signing posture and any customer distribution. This runbook
makes none of those decisions.

## Linux

No Linux installer or Linux runtime evidence is established by this runbook.
Do not offer Linux installation until an owner-selected artifact, provenance,
verification procedure and platform runtime evidence exist.
