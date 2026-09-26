# feat-release-path design: make the Windows installer publishable

Lane: `feat-release-path` (worktree `worktrees/mvp-release`, branch
`release/installer-publish`).
Base ref: `develop`. Base SHA: `7c7c83356c19d6dcfe0bac17a636df3ecdc88dae`.
Review tier: Standard (workflow and config change, no product code).

## Goal

A customer must be able to download a Windows installer. Today the NSIS
installer builds locally, but no workflow can publish it: `gh workflow run
beta.yml` returns HTTP 422, and every recorded Beta, Release, and Nightly run
failed at startup with zero jobs.

## Root cause

Two independent blockers, both confirmed against the live repository.

### 1. The workflow files are not valid YAML (fixed on this branch)

`beta.yml`, `release.yml`, and `nightly.yml` each embed a PowerShell
here-string:

```
$nodeScript = @'
const crypto = require("node:crypto");
...
'@
```

A PowerShell here-string terminator must sit at column 0. A column-0 line ends
the surrounding YAML block scalar early, so the file stops being parseable from
that line on. PyYAML reproduces it:

```
FAIL .github/workflows/beta.yml       line 149, column 1   could not find expected ':'
FAIL .github/workflows/nightly.yml    line 147, column 1
FAIL .github/workflows/release.yml    line 139, column 1
```

GitHub's Actions API agrees. The three broken workflows are registered with
their own file path as the workflow `name` instead of `Beta` / `Release` /
`Nightly`, while the parseable workflows carry real names. Every push to a
branch that contains a broken file creates a run with `"jobs": []` and
`conclusion: "failure"`. Workflow id 317047081 (`beta.yml`) is the clearest
example: 10 of its last 10 runs are push-event startup failures.

### 2. `workflow_dispatch` requires the file on the default branch (parent action)

GitHub resolves `workflow_dispatch` from the default branch, which is `main`.
`main` contains only `ci.yml` and `opencode.yml`; `beta.yml` and `release.yml`
exist only on `develop` and feature branches. That is the 422. The same rule
makes `gh run list --workflow release-metadata.yml` return `404 ... not found on
the default branch`.

`main` is a strict ancestor of `develop`: `git rev-list --left-right --count
origin/main...origin/develop` is `0  124`, and `git log origin/develop..origin/main`
is empty. Promotion is therefore a fast-forward, and `release.yml`'s guard
(`git merge-base --is-ancestor HEAD origin/main`) starts passing once `main`
carries the workflow and the tagged commit.

## What changed

`.github/workflows/beta.yml`

- Replace the here-string with a single-line PowerShell string for the Node key
  generator. Same program, same `---SEPARATOR---` split.
- `gh release delete $tag ... --cleanup-tag`, so the recreated `beta` release
  also moves the `beta` tag to the dispatched commit. Without it the tag stays
  on the first dispatch's commit.

`.github/workflows/release.yml`

- Same here-string fix.
- Branch guard now fetches `main` with a step-scoped `${{ github.token }}`.
  The checkout uses `persist-credentials: false`, so `git fetch origin main`
  had no credentials on this private repo and would have failed the guard on
  every release. The fetch uses `--no-tags` and compares against `FETCH_HEAD`.

`.github/workflows/nightly.yml`

- Same here-string fix. `nightly.yml` carries the identical defect and is part
  of the release-channel family; leaving it knowingly broken would keep
  producing zero-job runs.

`docs/release.md`

- New runbook: the `main` prerequisite, the YAML defect, local and CI build
  steps, beta and stable publish flows, the not-ready list (code signing,
  update signing secrets, environments, changelog), verification steps, and a
  troubleshooting table.

No public API, contract, or product code changes. The workflows keep their
existing triggers, steps, and job shape.

## Contracts and boundaries

- `scripts/sign-update.mjs` writes `<base64url(canonical_json)>.<base64url(sig)>`.
  base64url excludes `.`, so the workflows' `LastIndexOf('.')` signature
  extraction is safe. Unchanged.
- `scripts/verify-release-assets.mjs` requires a `*-portable.zip` containing
  `Tuari.exe` and a `.update` whose signature verifies. The staged names
  (`tuari-<version>-<channel>-portable.zip`, `tuari-<version>-<channel>.update`)
  satisfy it. Unchanged.
- The release captain owns the `main` promotion, the tag, and the dispatch. A
  lane does not push to `main`, tag, or publish.

## Validation

Run in this worktree, Windows, Node 22.23.2, pnpm 10.8.1, cargo 1.88.0.

| Check | Command | Result |
| --- | --- | --- |
| YAML parses, all 7 files | `python -c "import yaml; yaml.safe_load(open(f))"` per file | 7/7 OK |
| Contracts build | `pnpm --filter @tuari/contracts build` | exit 0, 16s |
| Desktop build | `pnpm --filter @tuari/desktop build` | exit 0, 607s |
| Installer produced | `ls .../bundle/nsis/*.exe` | `Tuari_0.1.0_x64-setup.exe`, 30,148,806 bytes |
| Portable package | `pnpm --filter @tuari/desktop portable:only` | exit 0, `Tuari-portable.zip`, 42,998,131 bytes |
| Sign + verify path | manifest, `sign-update.mjs`, `verify-release-assets.mjs` | exit 0, signature VALID |
| Prose gate | `pnpm check:unslop` | 0 error-tier, PASS |
| Workflow assets | `pnpm check:workflow-assets` | 4 pass, 0 fail |
| Repo hygiene | `pnpm check:repo-hygiene` | 3 pass, 0 fail |
| Update metadata | `pnpm check:update-metadata` | 8 pass, 0 fail |
| Prose tests | `pnpm test:prose` | 7 pass, 0 fail |

The sign-and-verify step was reproduced locally with the real artifacts and a
CI-shaped ephemeral key: manifest for `0.1.0`, signature under `key-id
ci-generated-key`, `verify-release-assets.mjs --channel beta` passed both the
portable-zip and signature checks. That first reproduction called Node
directly, which is why the PowerShell output-capture defect below slipped past
it; the round 3 fix was re-verified through PowerShell.

## Round 3 review fixes (PR #391)

Greptile reviewed head `758fe89` at 3/5. All four findings were verified
against the source and all four are real.

- **P1, generated keys lose their contents (`beta.yml:146`, same in `release.yml`,
  `nightly.yml`).** PowerShell captures native-command output as a string array,
  one element per line, and `-split` maps over the elements. `$parts[0]` was
  therefore only `-----BEGIN PRIVATE KEY-----`. Reproduced with `pwsh`: the
  captured value was `System.Object[]` with 6 elements and `parts[0]` had no
  `END PRIVATE KEY` line. Fixed by joining before splitting:
  `$result = (node -e $nodeScript) -join "`n"`. The full keygen, sign, and
  verify path then passed through PowerShell with a complete PEM pair.
- **P1, failed fetch can bypass the guard (`release.yml:43`).** This was a
  regression from round 2. The guard read `FETCH_HEAD` without checking that the
  fetch succeeded, and checkout leaves its own `FETCH_HEAD`, so a stale value
  could satisfy the ancestry check. Fixed by aborting the step when the fetch
  exits non-zero, before `merge-base` runs.
- **P2, wrong installer name in the runbook (`docs/release.md`).** The beta job
  stages `tuari-<version>-beta-setup.exe`, so version `0.1.0-beta.1` produces
  `tuari-0.1.0-beta.1-beta-setup.exe`. The hash example had dropped the `.1`.
- **P2, verification steps cannot run (`docs/release.md`).** The example changed
  into `./verify` and only downloaded the installer, so `scripts/` did not
  resolve and the verifier had no portable zip or `.update`. Fixed to download
  all assets and run from the repository root. Added the caveat that the
  signature check needs the key that signed the release, which the ephemeral CI
  key does not provide.

Tests added in `tests/workflow-assets.test.mjs`: no workflow may contain a
column-0 here-string terminator; the three release workflows must join the key
output before splitting; the release guard must abort when the `main` fetch
fails.

## Risks and constraints

- The credential fix in `release.yml` cannot be exercised locally; it needs one
  real tag run on `main` to confirm end to end. The change preserves the
  checkout's `persist-credentials: false` posture.
- `main` promotion is out of this lane's scope by rule. Until it happens, the
  422 remains and no installer is publishable, despite the workflow fixes.
- The ephemeral CI signing key means auto-update is not customer-ready even
  after a successful publish. `docs/release.md` records the three missing
  secrets.
- Build commands rewrite tracked generated files (`bin/node.exe`,
  `gen/schemas/*.json`). They are build artifacts and were not staged.

## Deferred (parent decision)

- Provision `UPDATE_SIGNING_KEY` / `UPDATE_PUBLIC_KEY` / `UPDATE_KEY_ID`, or
  accept the ephemeral-key limitation for the MVP installer and keep
  auto-update out of scope. Dependency: the key pair must match what the app
  verifies against, which is not wired into Rust yet.
- Create the `beta` and `stable` environments with reviewers and per-channel
  keys (ADR-UPD-004). Independent of this lane.
- Code-signing certificate is a procurement decision, not a code change.
