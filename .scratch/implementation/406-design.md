# #406 — run the installer smoke test at the publish gate

- mode: local-only crew lane (parent owns push/PR; lane never pushes or merges)
- ticket: #406 "Run the installer smoke test in the release workflow so a
  non-starting artifact cannot be published"
- target ref: `feat/release-smoke-gate` off `develop`
- base SHA: `17911dc14211730bec6982707f518b4c84dafa19`
- review tier: Standard (CI workflows, tests, docs)

## Problem

`scripts/smoke/installer-smoke.mjs` (added by #405 for #404) extracts the built
portable zip, launches `Tuari.exe`, waits for the sidecar and `/health`, and
checks the database. It is local-only. A beta installer shipped with a sidecar
that could not start: the build was green, the release published, and the app
exited 101 on the customer's machine. Nothing at the publish gate launched the
artifact.

## Deliverable

- `.github/workflows/beta.yml`, `release.yml`, `nightly.yml`: a step after
  packaging and after the asset-verification smoke, before the release upload,
  that runs `node scripts/smoke/installer-smoke.mjs` against the staged portable
  zip and installer. A non-zero exit fails the job, so no release is created.
- `tests/workflow-assets.test.mjs`: a test that asserts each publish workflow
  runs the installer smoke after `portable:only` and before the upload step, and
  points it at the staged `tuari-$version-<channel>-portable.zip`.
- `docs/release.md`, `docs/release-verification.md`: what the gate checks, when
  it runs, and what a failure means for the operator.

## Interfaces

- No change to `scripts/smoke/installer-smoke.mjs`. The existing `--zip` and
  `--installer` flags point at the staged artifacts; the script never rebuilds.
- Staged paths, per the manifest step's staging block:
  `tuari-$version-beta-portable.zip` / `-setup.exe` (beta),
  `tuari-$version-stable-portable.zip` / `-setup.exe` (release),
  `tuari-$version-nightly-portable.zip` / `-setup.exe` (nightly).

## Dependencies and boundaries

- Reuses the artifact the packaging step already produced; no second build.
- Stays out of `ci.yml`: the check needs a full desktop build.
- Does not touch Rust or API code.

## Placement

The check runs in the existing "Smoke test" section, after
`verify-release-assets.mjs` and before "List ... artifacts" / the upload step.
`verify-release-assets.mjs` proves the zip contains `Tuari.exe` and the update
signature verifies; the installer smoke proves that `Tuari.exe` runs. Keeping
them adjacent keeps a single "does the artifact work" section.

## Tests

`tests/workflow-assets.test.mjs` gains one test over all three publishing
workflows: the smoke command exists, runs after `portable:only`, runs before the
upload, and points at the staged zip and installer. This prevents a later edit
from quietly dropping the gate or moving it after publication.

## Risks

- The smoke test launches a GUI process. GitHub-hosted `windows-latest` runs as
  an interactive autologon user and carries the WebView2 runtime, so it should
  run. The Rust shell spawns the sidecar as the first statement in Tauri's
  `setup`, before any frontend render, so the API checks do not depend on the
  webview drawing.
- The child-environment probe needs a same-user, non-elevated process read. On
  the runner that holds; if it is ever blocked the run reports a failed check
  rather than guessing.
- A runner-only failure has no fix in this change. The report names the failure
  modes so the parent can decide whether to gate the channel and land the
  workflow change behind a follow-up to the smoke script.
- Adding it to `nightly.yml` is a small scope extension over the issue text
  (which names `beta.yml` and `release.yml`): nightly also publishes an
  installer to a pre-release, so the same defect class applies. This is recorded
  here rather than deferred silently; the parent can drop nightly from the
  change if it prefers.
