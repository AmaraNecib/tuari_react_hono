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

`beta.yml` additionally patches `apps/desktop/src-tauri/tauri.conf.json` with the
version from the dispatch input before building, then deletes and recreates the
`beta` prerelease (with `--cleanup-tag`, so the `beta` tag always points at the
dispatched commit).

`release.yml` takes the version from the tag, requires the tag to be an ancestor
of `main`, and creates a normal release with generated release notes.

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

The `beta` channel is the fastest way to get a customer an installer, because it
needs no tag and no stable promotion.

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
  installer is unsigned. Windows SmartScreen shows "Windows protected your PC";
  the customer clicks **More info** then **Run anyway**. An EV or OV
  code-signing certificate is required to remove that warning.
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

Download and hash the asset:

```bash
gh release download beta --repo AmaraNecib/tuari_react_hono \
  --pattern '*-setup.exe' --dir ./verify
cd verify
certutil -hashfile ./tuari-0.1.0-beta-setup.exe SHA256
```

Run the installer. It uses `installMode: currentUser`, so it installs under the
user profile without an admin prompt. Launch Tuari, complete first-run setup,
and confirm the version in the app matches the release.

To verify the update package and portable zip the way CI does:

```bash
node scripts/verify-release-assets.mjs \
  --artifacts <dir-with-downloaded-assets> \
  --public-key <public-key.pem> \
  --version 0.1.0-beta.1 \
  --channel beta
```

That command exits 0 only when the portable zip contains `Tuari.exe` and the
`.update` signature verifies against the public key.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `gh workflow run` returns 422 "does not have 'workflow_dispatch' trigger" | The workflow does not exist on `main` | Promote `main` to `develop` (see the prerequisite) |
| A run shows `"jobs": []` and fails instantly | The workflow file is not valid YAML, or it is not on the default branch | Reproduce the parse locally with PyYAML; check the workflow `name` in the Actions API |
| `release.yml` aborts at "Verify tag is on main branch" | The tag is not an ancestor of `main` | Promote the commit to `main`, then re-tag |
| `gh run view --log` says "log not found" | GitHub has no logs for startup failures | Read the workflow file and reproduce the build locally |
| SmartScreen blocks the installer | The binary is unsigned | Click **More info** then **Run anyway**; get a signing certificate to remove it |

## Related documents

- `docs/adr/ADR-UPD-004.md` outlines the intended release pipeline, environments,
  and per-channel signing keys.
- `docs/update-architecture.md` covers the build pipeline, update system, and
  channel model.
- `scripts/verify-release-assets.mjs` and `scripts/sign-update.mjs` are the
  signing and verification tools the workflows call.
