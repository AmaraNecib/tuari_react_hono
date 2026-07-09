# M6.2 — CI/CD Pipeline Configuration

## Summary

Set up GitHub Actions workflows for building, signing, and releasing Tuari artifacts across three channels: stable, nightly, and beta.

## Design Decisions

### Workflow Separation
- **Three workflow files** rather than one large parametrized workflow. This keeps triggers explicit and failure domains isolated.
- Each workflow shares a common build + sign + publish structure via reusable composite actions where practical.

### Runner
- All workflows run on `ubuntu-latest` (the CI baseline).
- Tauri builds cross-compile for Windows via `cargo build --release`; the sign and package steps are platform-agnostic.

### Signing Keys
- **Release (stable):** Uses the dev key for now (`scripts/dev-update-keys/dev-update-private-key.pem`). Production key will be stored as a GitHub secret (`UPDATE_PRIVATE_KEY`).
- **Nightly:** Same dev key.
- **Beta:** Same dev key.

### GitHub Environments
- `nightly` — no approval required
- `beta` — requires 1 approval
- `stable` — requires 2 approvals, restricted to maintainers

Environments are referenced by the workflow but will be configured manually via the GitHub UI.

### Artifact Structure
```
tuari-<version>-<channel>-setup.exe     (NSIS installer)
tuari-<version>-<channel>-portable.zip   (portable package)
tuari-<version>-<channel>.update         (signed update manifest)
updates.json                              (update metadata)
```

### Caching
- Rust: `Swatinem/rust-cache@v2` with `workspaces: "apps/desktop/src-tauri"`
- pnpm: built-in `actions/setup-node` cache

### Smoke Test
A script `scripts/verify-release-assets.mjs` that:
1. Verifies the portable zip exists, extracts, and the binary (`Tuari.exe`) is present
2. Signs a test manifest, verifies it with `verify-signed-manifest.mjs`

### Documentation
Update `docs/development-workflow.md` with a "CI/CD Pipeline" section covering:
- Workflow triggers
- Artifact output
- Environment setup
- How to test locally

## Public API

### `.github/workflows/release.yml`
- **Triggers:** `push` to `main` with tag `v*.*.*`
- **Steps:** Checkout → Install deps → Build web+API → Build Rust → Sign update → Package artifacts → Upload to GitHub Releases

### `.github/workflows/nightly.yml`
- **Triggers:** Schedule (`0 0 * * *`) + `workflow_dispatch`
- **Steps:** Same as release but with `--channel nightly` and dev key

### `.github/workflows/beta.yml`
- **Triggers:** `workflow_dispatch` with `version` input
- **Steps:** Same as release but with `--channel beta` and beta key

## Implementation Risks

- GitHub Actions shell escaping for the signing command on Windows runners. Use `bash` consistently on ubuntu-latest.
- The Tauri build step (`cargo build --release`) is time-consuming. Caching mitigates this for re-runs.
- Workflows cannot be tested until merged — manual verification plan is required.
- GitHub Environments configuration is a manual step in the GitHub UI (not in YAML).

## Testing Plan

| Test | Type | Tool |
|------|------|------|
| Smoke test script verifies portable zip validity | Unit | Node test |
| Smoke test script verifies signed manifest validity | Unit | Node test |
| Release workflow parses correctly as YAML | Static | `yamllint` or `action-validator` |
| Nightly workflow parses correctly as YAML | Static | `yamllint` or `action-validator` |
| Beta workflow parses correctly as YAML | Static | `yamllint` or `action-validator` |
| Workflow syntax is valid | Integration | GitHub Actions (manual test on dispatch) |
