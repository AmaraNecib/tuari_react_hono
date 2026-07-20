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
Implementation (implement skill: TDD + code-review)
    ↓
Quality Check (skill-guided: codebase-design, diagnosing-bugs, domain-modeling, ...)
    ↓
Local Verification
    ↓
Pre-Push Self-Review (code-review skill)
    ↓
Push Feature Branch
    ↓
Open Pull Request (draft until CI passes)
    ↓
GitHub Actions Verification
    ↓
Fix CI (if necessary)
    ↓
Greptile Review (auto on PR create, manual @greptile-apps review on later commits)
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

### 4. Implementation (implement skill)

Load the `implement` skill. It reads the issue, implements using TDD at pre-agreed seams, runs typechecking and tests regularly, then runs `code-review` and commits to the current branch.

See `.agents/skills/implement/SKILL.md` for details.

### 4.5 — Quality Check (Skill-Guided Review)

After implementation but before running tests, load relevant skills to catch issues early.

The agent selects skills based on what the change touches:

| If the change touches... | Load these skills |
|---|---|
| New module, interface, or architecture | `codebase-design` — check depth, seam placement, deletion test |
| Complex logic, state, or edge cases | `diagnosing-bugs` — catch logic errors early |
| Domain entities, terms, or data models | `domain-modeling` — check ubiquitous language alignment |
| Any production code | `code-review` — review against coding standards |
| Large feature from a spec | `implement` — already loaded in step 4 |
| Unclear requirements or unknowns | `research` — investigate against primary sources |
| Planning a large chunk of work | `wayfinder` — break into investigation tickets |

These skills supplement the `code-review` already run by `implement`. The agent does **not** load all blindly — it picks the ones relevant to the issue.

**Why this exists:**
- Catches design and logic problems before tests are written
- Catches things `code-review` might miss (domain alignment, architecture depth, bug patterns)
- Uses the `.diwan/` model registry to route each skill to the best model

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

### 5.5 Pre-Push Self-Review (code-review skill)

After local verification passes but **before pushing**, the agent runs the
`code-review` skill against the current branch to catch issues locally.

**How it works:**

1. The parent agent reads `.diwan/models.yml` to select a review-capable model
   (e.g., `opencode-go/mimo-2.5` for review tasks).
2. The parent invokes the builtin `code-review` skill with the fixed point being
   `develop` (or the merge-base of the feature branch):
   ```
   git diff develop...HEAD
   ```
3. The code-review skill spawns **two parallel sub-agents**:
   - **Standards** — checks code against documented coding standards +
     Fowler smell baseline
   - **Spec** — checks if the implementation matches the originating
     issue / PRD / spec
4. The skill aggregates findings into a single report.

**Pass/Fail:**

- **No actionable findings** from either axis → ✅ safe to push. Proceed to step 6.
- **Actionable findings** → 🔧 fix them locally, re-run local verification
  (step 5), then re-run the self-review.
- **Only advisory warnings** (non-blocking) → agent uses judgment: push
  with `status:needs-investigation` label or fix before pushing.

**Why this exists:**

- Catches issues before they reach Greptile or CI, reducing feedback loops.
- Runs on Windows natively (no WSL required for the review itself).
- Uses the `.diwan/` model registry to enable model diversity — the reviewer
  can use a different model than the parent.
- The `code-review` skill's Standards + Spec axes catch problems Greptile might
  miss (spec drift, smell violations, missing tests).

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

### 9. Greptile Review

Greptile auto-reviews when the PR is first created. On subsequent commits, auto-review is disabled — trigger it manually.

Only after CI is fully green:
- Comment `@greptile-apps review` in the PR
- Wait for Greptile to complete (5-10 min depending on size)
- Check the review score (aim for 5/5)
- If Greptile finds problems:
  1. Load the `implement` skill with Greptile's findings as the input spec — it will fix, test, code-review, and commit
  2. Push the fixes
  4. Wait for CI to complete
  5. Trigger `@greptile-apps review` again
  6. Wait for Greptile to re-review
- Repeat until Greptile gives 5/5 or has no actionable findings

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
Local Verification (step 5)
    ↓
Pre-Push Self-Review (step 5.5) — code-review skill, local agent review
    ↓
Push Feature Branch (step 6)
    ↓
Open Pull Request (step 7)
    ↓
GitHub Actions (all required checks green)
    ↓
Request Greptile Review (step 9)
    ↓
Address comments (step 10)
    ↓
GitHub Actions green again (if new commits)
    ↓
Ready for merge
```

### Two-Layer Review

The project uses a **two-layer review system**:

**Layer 1: Pre-Push Self-Review** (`code-review` skill, step 5.5)
- Runs locally before pushing
- Uses the `code-review` skill with parallel Standards + Spec sub-agents
- Can use a different model (e.g., `opencode-go/mimo-2.5`)
- Catches spec drift, smell violations, missing tests, standard breaches
- Runs on Windows, no WSL required

**Layer 2: Greptile Review** (step 9)
- Runs in CI after all checks pass
- Provides automated code review with pre-merge checks
- Catches pattern-level issues the local review might miss

Greptile should review only after the Pull Request CI is passing. This avoids wasting reviewer time on failures that would have been caught by CI. The local self-review avoids wasting CI and Greptile on issues that could have been caught locally.

---

## Solo-Developer Agent Workflow

This section defines the protocol for a **single human developer** working with an **AI agent** (e.g., a coding assistant) and **Greptile** as the only reviewer.

In this workflow, the **agent is the de facto reviewer**. The human sets policy, the agent executes, and Greptile provides the automated code review. The agent MUST NOT merge a PR until all three gates below pass.

### Branch Protection Policy

| Branch | Approval required | Status checks required | Notes |
|---|---|---|---|
| `develop` | **No** | **Yes (all 6 CI jobs)** | Agent can merge when checks pass |
| `main` | **Yes** | Yes | Human approval required; harder to roll back |

The `main` branch is intentionally stricter because releases are harder to revert.

### Pre-Merge Gate (Three-Step)

Before merging any PR into `develop`, the agent MUST verify **all three steps** pass. If any step fails, the agent MUST NOT merge; it must surface the issue to the human.

#### Step 1 — CI Status

All 6 required CI jobs must be `pass`:
1. Lint
2. Type Check
3. Test API
4. Test Web
5. Test Rust Core (no tauri:: imports)
6. Build

If any job is `fail` or `pending` → **fix and re-run, do not merge**.

If any job is `pending` for an extended period (e.g., >10 minutes), investigate via `gh run watch`.

#### Step 2 — Greptile Two-Condition Check

A Greptile review is considered **"done and clean"** when **BOTH** conditions are true:

**Condition 1 — Verbal check**: Greptile's most recent review comment (the one with the Pre-merge checks section) says **"No actionable comments were generated"** OR only contains `⚠️ Warning` checks (advisory only, not blockers).

**Condition 2 — Temporal check**: Does the latest commit change **reviewable code**?

Reviewable code means: Rust, TypeScript, tests, CI config, or any file that *could* produce a new Greptile finding.

Non-reviewable code means: docs (.md), .gitignore, .gitattributes, .coderabbit.yaml, README, scratch files (.scratch/), or any config that doesn't affect the code being reviewed.

- If the latest commit changes **reviewable code** → review IS stale, needs re-trigger
- If the latest commit changes **only non-reviewable code** → old review is still valid, no re-trigger needed

This avoids unnecessary re-triggers for docs-only or config-only commits.

Use the `gh` CLI to fetch all comments:

```bash
# Issue-style comments (summary, "Action performed", "Walkthrough")
gh pr view <num> --comments --json comments

# Inline review comments (file/line level, with "Outdated" badges)
gh api repos/AmaraNecib/tuari_react_hono/pulls/<num>/comments

# Compare to latest commit
gh pr view <num> --json headRefOid
```

For **inline review comments marked "Outdated"** (file-level, line-level Nitpicks), the agent MUST:
1. Note the file and the original concern
2. Read the current state of that file
3. Determine: was the concern addressed in a later commit?
4. If yes → concern is resolved, no action
5. If no → concern still stands, treat as open finding

**Decision tree for Step 2:**

| Situation | Action |
|---|---|
| Greptile check is `pending` / `in_progress` | ⏳ **Wait** — do not trigger anything |
| Greptile check is `fail` (actionable findings) | 🔧 **Fix findings locally, push, re-trigger Greptile** |
| Greptile check is `pass` AND Condition 1 + 2 both pass | ✅ **Proceed to Step 3** |
| Greptile check is `pass` BUT Condition 2 fails (stale review) | 🔧 **Apply narrow workaround** (see below) |
| Greptile check is `pass` BUT inline concerns remain unresolved | 🔧 **Fix the concerns, push, re-trigger** |

#### Step 3 — Agent's Own Judgment (Soft Check)

Even with green CI and clean Greptile review, the agent MUST also consider:

- Is the architecture impact captured in the PR description?
- Are there security implications not addressed?
- Do tests cover the change adequately?
- Is the diff suspicious (unrelated file changes, large generated files, secrets, etc.)?
- Does the PR description accurately reflect the changes?

If **all of the above are clean** → ✅ **Merge** (proceed to merge command).

If **any of the above raises a real concern** but Steps 1 + 2 pass → ⚠️ **Merge with flag** (see uncertainty fallback).

### Narrow Workaround (Stale Review Only)

The workaround is a **narrow tool** for one specific situation: Greptile is `pass` but its review doesn't reflect the latest commit.

**When to apply:**
- We are confident the code is correct
- Greptile check is `pass` but no fresh review exists (Condition 2 fails)
- Goal: get a fresh review, NOT bypass a real concern

**Steps:**

1. Delete Greptile's old review summary and acknowledgment comments
2. Make a small cosmetic commit (e.g., a comment, formatting, whitespace — no behavior change)
3. Push and wait for CI to pass
4. Re-trigger Greptile with `gh pr comment <num> --body "@greptile-apps review"`
5. Wait for the new review
6. Re-apply the two-condition check

**When NOT to apply:**
- Greptile has unresolved findings → fix them, don't workaround
- The agent has its own concerns (Step 3) → surface to human
- The PR is in any other uncertain state → don't bypass, leave for human

### Uncertainty Fallback — Merge with Flag

When the agent is **uncertain** about merging (e.g., a finding is ambiguous, edge case not covered, but not a hard blocker):

**Do NOT refuse to merge** if dependent PRs may be blocked. Instead:

1. Add the `status:needs-investigation` label to the PR
2. Merge anyway (the work is done, and downstream PRs may be waiting)
3. Report clearly to the human:
   > "I merged PR #X with `status:needs-investigation` because [reason]. Dependent PRs #Y, #Z continue to work. Please review the merged PR when convenient."

The label persists on the merged PR and is searchable via `gh pr list --label status:needs-investigation`.

### Merge Command

When all three steps pass, the agent executes:

```bash
gh pr merge <num> --squash --subject "M<x.y>: <title> (closes #<issue>)"
```

**No `--delete-branch` flag** — feature branches are kept for reference.

**Merge commit format:** `M<milestone>: <short description> (closes #<issue>)`

Example: `M1.1: implement Rust Core scaffolding and shared crypto module (closes #71)`

### Why This Workflow Exists

A solo developer cannot approve their own PR. Traditional branch protection (require 1 approval) blocks all merges. This workflow replaces the human-approval gate with an **automated, deterministic agent gate** that:

1. **CI** = "did the build pass?"
2. **Greptile two-condition check** = "is the review complete and clean?"
3. **Agent judgment** = "is anything obviously wrong that the tools missed?"

The agent is accountable for following this gate. The human is accountable for the policy and for reviewing any `status:needs-investigation` PRs after the fact.

---

## Definition of Done

A feature is complete when:

- [ ] Local verification passes
- [ ] Pre-Push Self-Review (code-review skill) passes with no actionable findings
- [ ] Feature branch is pushed
- [ ] Pull Request exists in GitHub
- [ ] GitHub Actions are green
- [ ] Greptile has been requested (unless prevented by permissions)
- [ ] Greptile feedback has been addressed (if any)
- [ ] PR has been merged into `develop`
- [ ] Issue has been closed
