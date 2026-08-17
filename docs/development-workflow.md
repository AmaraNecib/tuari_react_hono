# Development Workflow

This document defines the permanent development workflow for the Tuari project. It covers branching, issue tracking, releases, and versioning.

---

## 1. Planning Flow

```
Architecture (docs/)
    ↓
PRD (docs/prd/)
    ↓
.scratch/issues (draft planning)
    ↓
GitHub Issues (execution)
    ↓
Implementation
```

| Stage | Location | Purpose |
|-------|----------|---------|
| Architecture | `docs/*.md` | Permanent, approved. Changes only through ADRs. |
| PRD | `docs/prd/*.md` | Approved product requirements. Read-only during implementation. |
| Draft planning | `.scratch/issues/` | Temporary workspace for issue breakdown before GitHub. |
| Execution | GitHub Issues | Source of truth during implementation. |

---

## 2. Issue Taxonomy

### 2.1 Labels — Priority

| Label | Meaning |
|-------|---------|
| `priority:high` | Blocking. Must be completed in current milestone. |
| `priority:medium` | Important. Should be completed in current milestone. |
| `priority:low` | Nice to have. Deferred if time runs short. |

### 2.2 Labels — Area

| Label | Scope |
|-------|-------|
| `area:rust-core` | Rust Core (Trust Authority): `crypto.rs`, `license.rs`, `clock.rs`, `update.rs`, `recovery.rs` |
| `area:licensing` | Licensing system: `LicenseManager`, activation, grace period, key rotation |
| `area:update` | Update system: update packages, rollback, recovery environment |
| `area:desktop` | Tauri Adapter: IPC commands, sidecar lifecycle, platform integration |
| `area:contracts` | `packages/contracts`: shared Zod schemas, TypeScript types |
| `area:cli` | CLI tools: `generate-license.mjs`, `sign-update.mjs` |
| `area:testing` | Integration tests, E2E tests, test infrastructure |
| `area:debt` | Debt/payments module |
| `area:inventory` | Inventory items and warehouses |
| `area:projects` | Projects and worker assignment |
| `area:employees` | Employee management and roles |
| `area:auth` | Authentication and session management |
| `area:permissions` | RBAC and permission system |

### 2.3 Labels — Type

| Label | Meaning |
|-------|---------|
| `type:feature` | New functionality |
| `type:bug` | Defect fix |
| `type:architecture` | Architectural change (requires ADR) |
| `type:refactor` | Code restructuring without behavior change |
| `type:test` | Test addition or improvement |
| `type:chore` | Maintenance task |
| `type:security` | Security-related |
| `type:documentation` | Documentation-only |

### 2.4 Labels — Status

| Label | Meaning |
|-------|---------|
| `status:blocked` | Waiting on another issue, external dependency, or decision |
| `status:ready` | Dependencies resolved, available for implementation |
| `status:in-progress` | Actively being implemented |
| `status:review` | Implementation complete, awaiting code review |
| `status:testing` | In test or QA |
| `status:done` | Completed and merged |
| `ready-for-agent` | Issue is ready for an AFK agent to work on |

---

## 3. Branch Strategy

### 3.1 Permanent Branches

| Branch | Purpose | Protected? |
|--------|---------|------------|
| `main` | Production history. Only receives merges from `release/*` and `hotfix/*`. | Yes |
| `develop` | Integration branch for active development. Receives `feature/*` branches. | Yes |
| `release/*` | Release stabilization. Branch from `develop`, merge to `main` and back to `develop`. | Yes |
| `hotfix/*` | Emergency fixes for released versions. Branch from `main`, merge to `main` and `develop`. | Yes |
| `feature/*` | One feature per branch, one GitHub Issue per branch. Branch from `develop`, merge to `develop`. | No |
| `fix/*` | One bug fix per branch. Branch from `develop`, merge to `develop`. | No |
| `refactor/*` | One refactor per branch. Branch from `develop`, merge to `develop`. | No |
| `agent/*` | Admin/cleanup/housekeeping. Branch from `develop`, merge to `develop`. | No |

### 3.2 Typical Flow

```
feature/m1.3-license-manager
         ↓
       develop
         ↓
    release/0.1.0
         ↓
        main
```

### 3.3 Hotfix Flow

```
  main (0.1.0)
    ↓
hotfix/0.1.1
    ↓
  main (0.1.1)  ──→  develop (merge back)
```

The hotfix must always be merged back into `develop` so fixes are never lost.

### 3.4 Branch Naming

```
feature/<issue-id>-<short-description>
feature/m1.3-license-manager
feature/m1.7-license-cli

fix/<issue-id>-<short-description>
fix/issue-160-rust-warnings

refactor/<issue-id>-<short-description>
refactor/plan-005-god-object-splits

agent/<short-description>
agent/cleanup-dirty-wip

hotfix/<version>-<short-description>
hotfix/0.1.1-crash-on-startup

release/<version>
release/0.1.0
release/0.2.0
```

### 3.5 Branch Prefixes

| Prefix | Purpose |
|--------|---------|
| `feature/` | New functionality. Tracks a GitHub issue. |
| `fix/` | Bug fix or non-functional improvement. Tracks a GitHub issue. |
| `refactor/` | Code restructuring without behavior change. Tracks a GitHub issue. |
| `agent/` | Admin/cleanup/housekeeping tasks performed by automation. No issue required. |
| `hotfix/` | Emergency fix for released version. Branches from `main`. |
| `release/` | Release stabilization. Branches from `develop`. |

---

## 4. GitHub Milestones

Milestones map directly to the implementation roadmap.

| Milestone | Version | Description |
|-----------|---------|-------------|
| Milestone 1 | 0.1.0 | Rust Trusted Computing Base |
| Milestone 2 | 0.2.0 | Updater Engine |
| Milestone 3 | 0.3.0 | Tauri Integration |
| Milestone 4 | 0.4.0 | Business Authority (Hono) |
| Milestone 5 | 0.5.0 | React UI |
| Milestone 6 | 0.6.0 | Release Engineering |
| Milestone 7 | 0.7.0 | Production Hardening |
| — | 1.0.0 | First public production release |

Each GitHub Milestone contains the issues for that phase. Issues are labeled by priority and area.

---

## 5. Release Channels

| Channel | Description | Source Branch | Version Suffix |
|---------|-------------|---------------|----------------|
| **Nightly** | Automatic development builds | `develop` | `-nightly.N` |
| **Beta** | Feature-complete pre-releases | `release/*` | `-beta.N` |
| **Stable** | Production releases | `main` | None |

These names communicate stability:
- **Nightly** = may break, use at your own risk
- **Beta** = feature-complete, collecting feedback
- **Stable** = production-ready

---

## 6. Versioning

Semantic Versioning (`MAJOR.MINOR.PATCH`).

### Pre-1.0 (current phase)

```
0.1.0  — Milestone 1 complete
0.2.0  — Milestone 2 complete
0.2.1  — Patch after 0.2.0
0.3.0  — Milestone 3 complete
```

### First Stable Release

```
1.0.0  — First public production release
```

### Post-1.0

```
1.0.1  — Bug fix
1.1.0  — New feature (backward-compatible)
2.0.0  — Breaking change
```

### Pre-release Suffixes

```
0.3.0-nightly.15    — 15th nightly build toward 0.3.0
1.1.0-beta.2     — 2nd beta of 1.1.0
```

---

## 7. Hotfix Policy

| Situation | Action |
|-----------|--------|
| Critical bug in stable release | Create `hotfix/<version>-<description>` from `main`, fix, release as patch |
| Non-critical bug | Schedule in next milestone |
| Security vulnerability | Create hotfix immediately, then file ADR if architectural change is needed |

Hotfixes bypass the `develop` branch but must be merged back into `develop` after release.

---

## 8. GitHub Releases

Every tagged release includes:

- Semantic version tag (e.g., `v0.1.0`)
- Release channel (Stable / Preview / Nightly)
- Changelog (list of changes since last release)
- Upgrade notes (migration steps, if any)
- Breaking changes (if any)
- Downloadable artifacts (installer, portable, update package)

This integrates with the Update Architecture, where clients subscribe to one channel and receive only compatible updates.

---

## 9. Issue Template

Every GitHub Issue should follow this structure:

```markdown
## Objective

<!-- One-sentence description of what this issue accomplishes -->

## Dependencies

- #123 (must be merged first)
- #456 (must be merged first)

## Implementation Tasks

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Testing Requirements

- [ ] Unit test: scenario X
- [ ] Integration test: scenario Y

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## References

- **PRD:** docs/prd/licensing-prd.md
- **Architecture:** docs/licensing-architecture.md (§15.1)
- **ADRs:** ADR-LIC-001
```

---

## 10. Mapping: `.scratch` → GitHub

| `.scratch` | GitHub |
|------------|--------|
| `.scratch/issues/milestone-1-backlog.md` | Milestone 1 |
| Each issue in backlog | One GitHub Issue |
| Complexity estimate (S/M/L) | `priority:*` label |
| Dependencies | Linked issues |
| — | Milestone progress tracking |

Once an issue is approved in `.scratch`, it is created as a GitHub Issue. The `.scratch` version is archived or deleted. GitHub becomes the source of truth for execution.

---

## 11. Definition of Done

An issue is complete when:

- [ ] All implementation tasks are complete
- [ ] All acceptance criteria pass
- [ ] Automated tests are written and passing
- [ ] Code has been reviewed and approved
- [ ] Feature branch has been merged into `develop`
- [ ] All acceptance criteria pass

---

## 12. CI/CD Pipeline

### 12.1 Workflows

| Workflow | Trigger | Environment | Artifacts |
|----------|---------|-------------|-----------|
| **Release** | Tag push `v*.*.*` on `main` | `stable` (2 approvals) | Installer, portable zip, update package, updates.json |
| **Nightly** | Daily at midnight UTC + `workflow_dispatch` | `nightly` (no approval) | Same as release, published to nightly channel |
| **Beta** | `workflow_dispatch` with `version` input | `beta` (1 approval) | Same as release, published to beta channel |

### 12.2 Build Pipeline

All three workflows share the same build steps:

1. **Setup:** Checkout, pnpm + Node.js 22, Rust toolchain, caches
2. **Dependencies:** `pnpm install --frozen-lockfile` + `pnpm --filter @tuari/contracts build`
3. **Desktop build:** `pnpm --filter @tuari/desktop build` (builds web frontend, API sidecar, and Rust Tauri app)
4. **Portable package:** `pnpm --filter @tuari/desktop portable:only`
5. **Sign update:** Compute SHA-256 of portable zip, create manifest, sign with `scripts/sign-update.mjs`
6. **Smoke test:** `scripts/verify-release-assets.mjs` validates the portable zip and signed update package
7. **Stage and publish:** Collect all artifacts and upload to GitHub Releases

### 12.3 Artifacts

Each workflow produces:

| Artifact | Naming Pattern | Source |
|----------|---------------|--------|
| NSIS installer | `tuari-<version>-<channel>-setup.exe` | Tauri build output |
| Portable zip | `tuari-<version>-<channel>-portable.zip` | `build-portable.mjs` |
| Signed update | `tuari-<version>-<channel>.update` | `sign-update.mjs` |
| Update metadata | `updates.json` | Generated inline |

### 12.4 GitHub Environments

| Environment | Approval Required | Restricted To |
|-------------|-------------------|---------------|
| `nightly` | None | — |
| `beta` | 1 approval | — |
| `stable` | 2 approvals | Maintainers |

Environments are configured via the GitHub UI under Settings > Environments.

### 12.5 Signing Keys

| Channel | Key | Storage |
|---------|-----|---------|
| Nightly | Dev key (`scripts/dev-update-keys/dev-update-private-key.pem`) | Repository (dev only) |
| Beta | Dev key (will be replaced with beta key) | Repository (dev only) |
| Stable | Dev key (will be replaced with production key) | GitHub secret `UPDATE_PRIVATE_KEY` (future) |

### 12.6 CI Runners & Caching

CI (`ci.yml`) runs on **self-hosted Linux runners** (`runner-1` / `runner-2`, systemd services running as the `github` user on the CI VPS). The release-flavored workflows stay on **GitHub-hosted** runners — `windows-latest` for the release builds (`beta.yml`, `nightly.yml`, `release.yml`) and `ubuntu-latest` for `release-metadata.yml`. On the self-hosted runners, tools are provisioned per-run by the setup actions and caches are keyed by `actions/cache`:

- **pnpm store:** `actions/setup-node` with `cache: pnpm` — keyed on `pnpm-lock.yaml`
- **Rust/Cargo:** `Swatinem/rust-cache` scoped to `apps/desktop/src-tauri`
- **Node/pnpm/Rust versions:** pinned per-run (`setup-node` 22, `pnpm/action-setup` from `packageManager`, `dtolnay/rust-toolchain@stable`)
- **System deps (Tauri + Playwright):** pre-installed once on the runners as `root` (`libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, plus Playwright's Chromium OS deps). Jobs do **not** run `sudo apt-get` — they only verify presence (e.g. `pkg-config --exists webkit2gtk-4.1`) and install the Chromium *binary* (`pnpm exec playwright install chromium`) into the run's cache. The runner service users hold **no elevated privileges**.
- **Checkout:** Uses default `clean: true` (actions/checkout) — each run gets a fresh workspace, avoiding stale artifacts from previous runs

### 12.7 Smoke Testing

The `scripts/verify-release-assets.mjs` script runs after every build:

```bash
node scripts/verify-release-assets.mjs --artifacts <dir> --public-key <path> --version <ver> --channel <channel>
```

It verifies:
1. A portable zip file exists and contains `Tuari.exe`
2. A signed update manifest (`.update`) exists and the signature is valid against the public key

Exit code 0 = all checks pass. Non-zero = at least one check failed.
