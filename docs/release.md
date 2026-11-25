# Windows installer release runbook

How to build, publish, and verify the Tuari Windows installer. Two channels
exist: `beta` (manual dispatch) and `stable` (tag push). Read the prerequisite
first: publishing is currently blocked on a branch promotion that an operator
must perform.

## Prerequisite: the workflow files must exist on `main`

GitHub resolves `workflow_dispatch` from the repository's **default branch**.
This repo's default branch is `main`, and `main` contains only `ci.yml` and
`opencode.yml`. `beta.yml`, `release.yml`, and `nightly.yml` live on `develop`
and feature branches. That is the root cause of:

```
$ gh workflow run beta.yml
HTTP 422: Workflow does not have 'workflow_dispatch' trigger
```

The same rule explains `gh run list --workflow release-metadata.yml` returning
`404 ... not found on the default branch`. `release.yml` is blocked from the
other side too: its guard refuses a tag that is not an ancestor of `main`.

`main` is a strict ancestor of `develop` (0 commits on `main` that are not on
`develop`, 124 the other way), so promotion is a fast-forward. An operator or
the release captain performs it. A crew lane must never push to `main`.

```bash
# Fast-forward main to develop. No merge commit is created.
git fetch origin
git push origin origin/develop:refs/heads/main
```

A pull request from `develop` into `main` is equivalent if branch protection is
added later. After promotion, `beta.yml` is dispatchable and `release.yml`
accepts tags that are ancestors of `main`.

## The YAML defect that made the release workflows unrunnable

Independent of the branch problem, three workflow files failed to parse. Each
embedded a PowerShell here-string (`@'` ... `'@`) whose terminator must sit at
column 0. A column-0 line ends the surrounding YAML block scalar early, so the
file was not valid YAML.

Symptoms this produced:

- `gh api repos/{owner}/{repo}/actions/workflows` reported each broken workflow
  with its own file path as the `name` instead of `Beta` / `Release` / `Nightly`.
- Every push to any branch that contained the file created a run that failed at
  startup with no jobs: `"conclusion": "failure"`, `"jobs": []`.
- `workflow_dispatch` could not be resolved, so dispatch returned 422.

The fix keeps the Node key-generation program on one line, which removes the
here-string entirely. All seven workflow files now pass
`python -c "import yaml; yaml.safe_load(open(...))"`.

Symptom to recognise in future: a run with `"jobs": []` means GitHub could not
load the workflow, not that a step failed. The run logs are usually unavailable
for these; read the workflow file and reproduce the build locally instead.

## How the installer is built

Tauri builds the NSIS installer from `apps/desktop`:

```bash
pnpm install --frozen-lockfile
pnpm --filter @tuari/contracts build
pnpm --filter @tuari/desktop build
```

Output: `apps/desktop/src-tauri/target/release/bundle/nsis/Tuari_<version>_x64-setup.exe`.
The last measured build on this machine took 607s for the desktop step and
produced 30,148,806 bytes (28.75 MB) at version `0.1.0`. `pnpm install` added
162s and the contracts build 16s.

The portable package is a separate step that both release workflows run:

```bash
pnpm --filter @tuari/desktop portable:only
# -> apps/desktop/src-tauri/target/release/bundle/portable/Tuari-portable.zip
```

The workflows build on `windows-latest` and run the same commands, so a local
success is a good predictor of a CI success.

## What the release workflows do

Both `beta.yml` and `release.yml` run this sequence:

1. Check out the repository and install pnpm, Node 22, and the Rust toolchain.
2. `pnpm install --frozen-lockfile` and `pnpm --filter @tuari/contracts build`.
3. A guardrail step that rejects `tauri::` imports in the Rust Core modules.
4. Build the desktop app and create the portable package.
5. Generate or resolve the update signing key pair (see the not-ready section).
6. Hash the portable zip, write a manifest, sign it with Ed25519, and stage the
   installer, the portable zip, the `.update` package, and `updates.json`.
7. Run `scripts/verify-release-assets.mjs`, which checks that the portable zip
   contains `Tuari.exe` and that the `.update` signature verifies.
8. Run `scripts/smoke/installer-smoke.mjs` against the staged portable zip and
   installer. This extracts the zip, launches `Tuari.exe`, waits for the API
   sidecar and `/health`, and confirms the app wrote its SQLite database. A
   non-zero exit fails the job, so the release is never created.

`beta.yml` additionally patches `apps/desktop/src-tauri/tauri.conf.json` with the
version from the dispatch input before building, then deletes and recreates the
`beta` prerelease (with `--cleanup-tag`, so the `beta` tag always points at the
dispatched commit).

`release.yml` takes the version from the tag, requires the tag to be an ancestor
of `main`, and creates a normal release with generated release notes.

## The installer smoke gate

Step 8 is the only gate that runs the built artifact instead of its source.
`verify-release-assets.mjs` proves the zip contains `Tuari.exe`; the installer
smoke proves `Tuari.exe` starts. It launches the app exactly as a customer
would:

- extracts the staged `tuari-<version>-<channel>-portable.zip` to a temp
  directory,
- checks `Tuari.exe`, the bundled `bin/node.exe`, the `api-runtime` sidecar
  entry, the SQLite native binding, and every `tauri.conf.json`
  `bundle.resources` entry are present,
- starts `Tuari.exe`, waits for the `node.exe ... api-runtime/dist/index.cjs`
  child, and requires `GET /health` to return `{"status":"ok"}`,
- confirms the app wrote a fresh, schema-complete SQLite database and its clock
  tracker, then shuts both processes down and removes the temp directory.

It runs after packaging and before the upload, on `beta.yml`, `release.yml`, and
`nightly.yml`, all on `windows-latest`. It does not run in `ci.yml`: a full
desktop build is required, so the check belongs at the publish gate.

When it fails, nothing is published. The step prints one line per check, and the
failing check names the cause (a missing bundle entry, an app that exited before
spawning the sidecar, a sidecar that never bound the port, a missing or stale
database, or an unexpected license handoff). The full check list and the two
startup defects it was built to catch are in `docs/release-verification.md`.

The gate needs an interactive Windows session: it launches a GUI process, and it
reads the child sidecar's environment block, which needs a same-user,
non-elevated process read. GitHub-hosted `windows-latest` runners meet both. A
non-zero exit on a machine that cannot (no desktop session, or an elevated user)
is an infrastructure problem, not a broken installer; the failing check names
which read failed.

## Publishing the beta channel

1. Confirm `main` contains `beta.yml` (see the prerequisite) and that CI is
   green on the commit you intend to ship.
2. Dispatch the workflow with a semver beta version:

   ```bash
   gh workflow run beta.yml \
     --repo AmaraNecib/tuari_react_hono \
     --ref main \
     -f version=0.1.0-beta.1
   ```

3. Watch it:

   ```bash
   gh run list --workflow beta.yml --repo AmaraNecib/tuari_react_hono --limit 3
   gh run watch <run-id> --repo AmaraNecib/tuari_react_hono
   ```

4. The job creates or replaces the `beta` prerelease. Anyone can download it:

   ```bash
   gh release view beta --repo AmaraNecib/tuari_react_hono
   gh release download beta --repo AmaraNecib/tuari_react_hono --pattern '*-setup.exe'
   ```

The `beta` channel is an internal prerelease channel, not an approved customer
installer. Neither channel availability nor a successful publish authorizes
customer distribution. Apply the [manual-update gates](manual-update-runbook.md)
before any installation; release selection remains the owner's decision.

## Publishing the stable channel

A stable release is a tag on `main` (or an ancestor of `main`).

1. Set `apps/desktop/src-tauri/tauri.conf.json` `version` to the version you are
   tagging. `release.yml` does **not** patch it for stable, so the app would
   otherwise report the old version even though `updates.json` says the new one.
2. Merge that bump to `main`.
3. Tag and push:

   ```bash
   git tag -a v0.1.0 -m "Tuari v0.1.0"
   git push origin v0.1.0
   ```

4. `release.yml` verifies the tag is an ancestor of `main`, builds, signs, and
   publishes a GitHub Release at `v0.1.0` with generated notes.

Tags that are not on `main` are rejected by the guard on purpose. Do not bypass
it; promote the commit first.

## What is not ready

These are known gaps, not workflow bugs. They do not stop an installer from
being downloaded, but a customer may notice them.

- **No code-signing certificate.** `tauri.conf.json` sets
  `bundle.targets: "nsis"` and has no Windows signing configuration, so the
  installer is unsigned. Windows may show a SmartScreen or other security
  warning. Stop the installation and escalate to the release owner. Never
  bypass an operating-system warning. The owner must approve the release and
  signing posture before customer installation.
- **No production update signing key.** Repository secrets
  `UPDATE_SIGNING_KEY`, `UPDATE_PUBLIC_KEY`, and `UPDATE_KEY_ID` are unset
  (`gh secret list` returns nothing). Both workflows fall back to generating an
  ephemeral Ed25519 key pair in CI, signing the manifest with `key-id:
  ci-generated-key`, and discarding the key when the job ends. The published
  `updates.json` therefore cannot be verified by any installed client. The only
  committed key pair is the development pair in `scripts/dev-update-keys/`;
  never ship it to customers. Provision the three secrets (repo-level or per
  environment) before relying on auto-update.
- **No `beta` or `stable` environment.** `gh api .../environments` returns only
  `copilot`. The jobs reference `environment: beta` and `environment: stable`,
  but no protection rules exist, so nothing gates a release. Create both
  environments with required reviewers and their own signing secrets to match
  ADR-UPD-004.
- **No changelog artifact.** Both workflows attach `generate_release_notes` to
  the release, but ADR-UPD-004 also expects a changelog file in the assets. That
  file is not produced yet.

## Verifying a published installer

This section describes internal artifact checks, not installation approval.
Before downloading or executing a customer candidate, satisfy the
[manual-update runbook](manual-update-runbook.md), including exact-artifact
approval, provenance and a data-specific backup/recovery plan. Those gates are
not met by this document. The commands below use beta as an internal example,
not as a customer recommendation.

For an approved internal inspection, download the selected release's assets:

```bash
gh release download beta --repo AmaraNecib/tuari_react_hono --dir ./verify
ls ./verify
```

The installer asset is named `tuari-<version>-<channel>-setup.exe`. For the
`0.1.0-beta.1` example that is `tuari-0.1.0-beta.1-beta-setup.exe`. Hash it:

```bash
certutil -hashfile ./verify/tuari-0.1.0-beta.1-beta-setup.exe SHA256
```

Do not run the installer against customer data on the strength of these checks.
Only after all manual-update gates pass may an authorized operator test the
selected installer in a disposable environment. The configured installation
mode is `currentUser`; that configuration alone is not shipped-runtime proof.
Record the installed version and startup result. Stop on any security warning
or unexpected data location; do not overwrite an existing customer project.

To verify the portable zip and update package the way CI does, run the script
from the repository root (it resolves `scripts/` against the current directory)
and point `--artifacts` at the download directory:

```bash
node scripts/verify-release-assets.mjs \
  --artifacts ./verify \
  --public-key <public-key.pem> \
  --version 0.1.0-beta.1 \
  --channel beta
```

That command exits 0 only when the portable zip contains `Tuari.exe` and the
`.update` signature verifies against the public key. The key must be the one
that signed this release. While the update signing secrets are unset, CI signs
with an ephemeral key that it discards when the job ends, so an external
operator cannot reproduce the signature check. Set `UPDATE_PUBLIC_KEY` first if
you need it. Without a matching key the portable-zip check still runs and only
the signature check fails.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `gh workflow run` returns 422 "does not have 'workflow_dispatch' trigger" | The workflow does not exist on `main` | Promote `main` to `develop` (see the prerequisite) |
| A run shows `"jobs": []` and fails instantly | The workflow file is not valid YAML, or it is not on the default branch | Reproduce the parse locally with PyYAML; check the workflow `name` in the Actions API |
| `release.yml` aborts at "Verify tag is on main branch" | The tag is not an ancestor of `main` | Promote the commit to `main`, then re-tag |
| `gh run view --log` says "log not found" | GitHub has no logs for startup failures | Read the workflow file and reproduce the build locally |
| Windows displays SmartScreen or another security warning | The installer is unsigned or its reputation is unknown | Stop. Do not bypass the warning. Escalate to the release owner. |

## Manual update readiness

The in-app update flow is not an installation path for customers. Its apply
strategy currently reports failure without replacing application files. Use
only an owner-approved manual installer source and verify the artifact as
described in [the manual-update runbook](manual-update-runbook.md). This
readiness note does not select a release or authorize distribution.

## Related documents

- `docs/adr/ADR-UPD-004.md` outlines the intended release pipeline, environments,
  and per-channel signing keys.
- `docs/update-architecture.md` covers the build pipeline, update system, and
  channel model.
- `scripts/verify-release-assets.mjs` and `scripts/sign-update.mjs` are the
  signing and verification tools the workflows call.
