# Milestone 0 — Implementation Backlog

## Project Infrastructure

**Target Version:** 0.0.0
**Purpose:** Engineering environment setup. No product code. All milestones after this one are purely product delivery.

---

## Issue M0.1 — GitHub Repository Setup

**Milestone:** Milestone 0 — Project Infrastructure
**Target Version:** 0.0.0
**Epic:** M0 — Project Infrastructure
**Area:** Infrastructure
**Priority:** High
**Labels:** `area:desktop`, `priority:high`, `type:task`, `release:0.0.0`
**Dependencies:** None

**Objective:** Configure GitHub repository settings, labels, milestones, branch protection, and issue templates before any implementation begins.

### Implementation Tasks

- [ ] Create GitHub Labels:
  - Priority: `priority:high`, `priority:medium`, `priority:low`
  - Area: `area:rust-core`, `area:licensing`, `area:update`, `area:desktop`, `area:contracts`, `area:cli`, `area:testing`
  - Type: `type:feature`, `type:bug`, `type:architecture`, `type:refactor`, `type:test`, `type:documentation`
  - Status: `blocked`, `ready`, `review`, `needs-adr`
  - Release: `release:0.0.0`, `release:0.1.0`, `release:0.2.0`, `release:0.3.0`
- [ ] Create GitHub Milestones:
  - Milestone 0 — Project Infrastructure (v0.0.0)
  - Milestone 1 — Trusted Computing Base (v0.1.0)
  - Milestone 2 — Update Engine (v0.2.0)
  - Milestone 3 — Desktop Integration (v0.3.0)
  - Milestone 4 — Licensing UX (v0.4.0)
  - Milestone 5 — Release Engineering (v0.5.0)
  - Milestone 6 — Production Hardening (v0.6.0)
- [ ] Create GitHub Issue templates:
  - Feature implementation (`.github/ISSUE_TEMPLATE/feature.md`)
  - Bug report (`.github/ISSUE_TEMPLATE/bug.md`)
- [ ] Create GitHub Pull Request template (`.github/PULL_REQUEST_TEMPLATE.md`)
- [ ] Create `CODEOWNERS` file (`.github/CODEOWNERS`)
- [ ] Protect `main` and `develop` branches:
  - Require pull request reviews
  - Require status checks
  - Require up-to-date branches
- [ ] Create the initial `develop` branch from `main`
- [ ] Set up GitHub Actions workflow skeleton:
  - CI workflow (`.github/workflows/ci.yml`): typecheck, lint, test, build

### Acceptance Criteria

- [ ] All labels, milestones, and branch protections are configured.
- [ ] Issue and PR templates are available.
- [ ] CI workflow runs on every push to `develop` and `feature/*` branches.
- [ ] The repository is ready for Milestone 1 implementation.

### References

- **Documentation:** `docs/development-workflow.md`
