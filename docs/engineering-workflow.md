# Engineering Workflow

This document defines the permanent engineering workflow for the Tuari project. Every feature, from inception to merge, follows this lifecycle.

---

## Feature Lifecycle

```
Issue (GitHub)
    ↓
Architecture / ADR (if required)
    ↓
Design (.scratch/implementation/)
    ↓
Implementation (TDD: Red → Green → Refactor)
    ↓
Local Verification
    ↓
Push Feature Branch
    ↓
Open Pull Request (draft until CI passes)
    ↓
GitHub Actions Verification
    ↓
Fix CI (if necessary)
    ↓
Request CodeRabbit Review
    ↓
Address Review Feedback
    ↓
Final CI Verification (if new commits were pushed)
    ↓
Merge into develop
    ↓
Close Issue
```

---

## Step Details

### 1. Issue

Every implementation starts from a GitHub Issue. The issue must reference:
- The PRD it implements
- The architecture document it conforms to
- The ADRs that constrain it

See `.github/ISSUE_TEMPLATE/feature.md` for the template.

### 2. Architecture / ADR

Architecture is frozen during a milestone. If implementation reveals a genuine architectural problem:
- Stop implementation.
- Open an ADR.
- Resolve the architecture first.
- Then continue implementation.

Do not silently diverge from the approved architecture.

### 3. Design

Before writing production code, create a design document:

```
.scratch/implementation/<issue-id>-design.md
```

The design document must specify:
- Public API (structs, enums, traits, functions)
- Internal dependencies
- Planned tests
- Implementation risks
- Any deviations from the architecture

### 4. Implementation (TDD)

Follow strict Test-Driven Development:
1. **Red** — Write a failing test.
2. **Green** — Write the minimum code to make it pass.
3. **Refactor** — Clean up while keeping tests green.

Implement in small vertical slices. Each slice should be independently reviewable. Commit after each slice.

### 5. Local Verification

Before pushing any commit intended for review, run the complete local verification pipeline:

```bash
# Rust Core
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings

# TypeScript
pnpm typecheck
pnpm lint
pnpm test

# Contracts
pnpm --filter @tuari/contracts build

# Architecture guardrails (no tauri:: imports in Rust Core)
if grep -rnE '(^use tauri|tauri::)' apps/desktop/src-tauri/src/ --include='*.rs'; then
  echo "ERROR: Rust Core modules must not import tauri::"
  exit 1
else
  echo "PASSED: No tauri:: imports found in core modules"
fi
```

GitHub Actions **must not** be the first place failures are discovered. The objective is:

> GitHub Actions should verify the work, not discover predictable failures.

### 6. Push Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<issue-id>-<short-description>
# ... implement ...
git push origin feature/<issue-id>-<short-description>
```

Branch naming: `feature/<issue-id>-<short-description>` (e.g., `feature/m1.1-rust-core-scaffolding`).

### 7. Open Pull Request

Create a PR into `develop`. The PR must:
- Reference the issue: `Closes #71`
- Populate the PR template completely
- Apply the correct labels (`area:*`, `priority:*`, `type:*`, `release:*`)
- Be in draft state initially if CI has not yet passed

### 8. GitHub Actions Verification

Wait for all required CI checks to pass. If any check fails:
- Investigate the failure
- Fix locally
- Rerun local verification
- Push the fix
- Wait for CI again

### 9. Request CodeRabbit Review

Only after CI is fully green:
- Request a CodeRabbit review
- Wait for CodeRabbit to complete

### 10. Address Review Feedback

- Address every comment (either fix or explain why not)
- If changes were made: rerun local verification, push, wait for CI

### 11. Final CI Verification

After all review feedback is addressed and CI is green again, the PR is ready to merge.

### 12. Merge

Merge into `develop` using squash merge. The commit message should reference the issue:

```
m1.1: implement Rust Core scaffolding (closes #71)
```

### 13. Close Issue

After the merge is complete, close the GitHub Issue.

---

## Local Verification Policy

Before pushing any commit intended for review, reproduce locally everything that GitHub Actions will execute, whenever practical.

The CI workflow (`.github/workflows/ci.yml`) executes the following. Each must pass locally before pushing:

| Check | Command |
|-------|---------|
| Contracts build | `pnpm --filter @tuari/contracts build` |
| TypeScript type check | `pnpm turbo typecheck --filter='!@tuari/desktop'` |
| Lint | `pnpm turbo lint` |
| Rust Core tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| Rust Core clippy | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings` |
| Architecture guardrails | No `tauri::` imports in core modules |
| API tests | `pnpm --filter @tuari/api test` |
| Web tests | `pnpm test:web` |
| Build | `pnpm turbo build --filter='!@tuari/desktop'` |

**If a CI job cannot reasonably be executed locally**, (e.g., platform-specific builds, hosted services, protected secrets), document that limitation in the PR description.

---

## Commit Policy

- Small intermediate commits during implementation are acceptable on the feature branch.
- Do **not** push code that knowingly fails local verification.
- Before opening a Pull Request, the branch must pass the complete local verification pipeline.

---

## Review Policy

```
Push feature branch
    ↓
Open Pull Request
    ↓
GitHub Actions (all required checks green)
    ↓
Request CodeRabbit Review
    ↓
Address comments
    ↓
GitHub Actions green again (if new commits)
    ↓
Ready for merge
```

CodeRabbit should review only after the Pull Request CI is passing. This avoids wasting reviewer time on failures that would have been caught by CI.

---

## Definition of Done

A feature is complete when:

- [ ] Local verification passes
- [ ] Feature branch is pushed
- [ ] Pull Request exists in GitHub
- [ ] GitHub Actions are green
- [ ] CodeRabbit has been requested (unless prevented by permissions)
- [ ] CodeRabbit feedback has been addressed (if any)
- [ ] PR has been merged into `develop`
- [ ] Issue has been closed
