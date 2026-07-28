---
name: feature-implement
description: "Mandatory lifecycle orchestrator for code-changing issues. Delegates to implement, debate, guard, code-review, capture-wisdom. Read this first when the user says 'work on issue #N' or 'implement this feature'."
---

# Feature Implementation Orchestration

**Start here.** This is the mandatory entry point for all feature work.
Read `@docs/engineering-workflow.md` and `.agents/wisdom/*.md` first.

## Enforced order

Do not skip or reorder these steps.

### 1. Tier and base SHA

**Select review tier:**

| Tier | When |
|------|------|
| **Lightweight** | Truly non-reviewable files only (.gitignore, LICENSE, .scratch/) |
| **Standard** | Code, CI, workflow, config, skills, UI, API endpoints |
| **High-assurance** | Authz/permissions (RBAC), licensing/crypto, debt financial calculations, security |

Record the tier. Pass it to `guard`.

**Resolve base commit once:**

1. Target branch is always `develop` (unless the PR specifies a different base).
2. Fetch: `git fetch origin develop`
3. Compute merge-base: `git merge-base origin/develop HEAD`
4. Record target branch name and SHA for all subsequent steps.

### 2. Design (.scratch/implementation/)

Before writing production code, create a design document:

```
.scratch/implementation/<issue-id>-design.md
```

The design must specify:
- Public API / component interfaces
- Dependencies
- Planned tests (unit + Playwright E2E)
- Implementation risks

### 3. Implement (TDD + Playwright)

Load `implement` skill. It handles TDD at pre-agreed seams.

**Every feature MUST include:**

- **Unit tests** for business logic (via `pnpm test` / vitest)
- **Playwright E2E tests** for the user-facing flow, added to `tests/e2e/`
- Run `pnpm typecheck && pnpm test:web && pnpm test:api` during implementation

If the feature touches the Rust Core (`apps/desktop/src-tauri/src/`), also run:
```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings
```

### 4. Guard pre-review (Phase 1)

Run `guard` Phase 1 (pre-commit) to confirm everything compiles:
- `pnpm --filter @tuari/contracts build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:api`
- `pnpm test:web`

If the feature touches Rust Core, also run:
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings`

Do NOT proceed to reviews until this passes.

### 5. Quality check

Load relevant skills from the workflow's quality check table:

| If the change touches... | Load these skills |
|---|---|
| New module, interface, or architecture | `codebase-design` |
| Complex logic, state, or edge cases | `diagnosing-bugs` |
| Domain entities, terms, or data models | `domain-modeling` |
| Any production code | `code-review` |

### 6. Debate — High-assurance only

Load `debate` with resolved base SHA. Saves evidence to
`.scratch/reviews/<issue-id>/<head-sha>-debate.md`.

### 7. Test audit — Standard and High-assurance

Load `test-audit` with resolved base SHA. Saves evidence to
`.scratch/reviews/<issue-id>/<head-sha>-test-audit.md`.

**Checks performed:**
- Edge case coverage (empty states, error states, boundary values)
- Test quality (meaningful assertions, not just "doesn't crash")
- E2E coverage (critical user path is tested via Playwright)
- No shallow/missing tests

### 8. Pre-push self-review (code-review)

Run `code-review` skill against `git diff <base-sha>...HEAD`. Save output to
`.scratch/reviews/<issue-id>/<head-sha>-code-review.md`.

### 9. Guard pre-push (Phase 2)

Run `guard` Phase 2. Verifies:
- All checks pass (typecheck, lint, test:api, test:web)
- Review evidence files exist and are not stale
- Working tree is clean

**Evidence staleness check:**
- Extract SHA from evidence filenames in `.scratch/reviews/<issue-id>/`
- Compare to `git rev-parse HEAD`
- If different, inspect `git diff --name-only <evidence-sha> HEAD`:
  - If any reviewable file changed → evidence is **STALE**, must regenerate
  - If only non-reviewable files (.gitignore, LICENSE, .scratch/) → valid

### 10. Push + PR

Branch naming: `feature/<issue-id>-<short-description>`, `fix/<issue-id>-<description>`,
`refactor/<issue-id>-<description>`, or `agent/<description>`.

```bash
git push origin <branch-name>
gh pr create \
  --title "M<X.Y>: <description> (closes #<issue-id>)" \
  --body "See .scratch/reviews/<issue-id>/ for review evidence"
```

After opening the PR, publish a concise review-evidence summary as a PR comment.

### 11. CI + Greptile

Wait for CI green (all 6 jobs: lint, typecheck, test-api, test-web, test-rust, build).

Once CI is green:
- Trigger Greptile: comment `@greptile-apps review` in the PR
- Wait for Greptile to complete
- Address any actionable findings (fix locally → push → wait for CI → re-trigger)
- Repeat until Greptile passes with no actionable findings

### 12. Guard pre-report (Phase 3) + Capture wisdom

Run `guard` Phase 3. Verifies:
- CI — all checks green on GitHub
- PR description — accurate and complete
- Any deferred items — documented with follow-up issues

Then run `capture-wisdom` to save any lessons learned.

### 13. Report

Report to the user: PR link, CI status, Greptile verdict, any deferred items.

## Merge rules

- The agent may merge **only when ALL** of these are true:
  1. The user explicitly says to merge
  2. CI is green (all 6 jobs)
  3. Greptile has no actionable findings
  4. The agent finds no blocker
- Merge command:
  ```bash
  gh pr merge <num> --squash --subject "M<x.y>: <title> (closes #<issue>)"
  ```
- If any condition is not met, report to the user — do not merge.

## Where to start

| State | Start at |
|-------|----------|
| Nothing exists | Read workflow + wisdom |
| No design doc | Step 1 → design |
| Code not written | Step 2 — implement |
| No reviews done | Step 3 — guard pre-review |
| No quality check | Step 4 — quality check |
| No debate | Step 5 — debate |
| No test audit | Step 6 — test audit |
| No code-review | Step 7 — code-review |
| Locally unverified | Step 8 — guard pre-push |
| Not pushed | Step 9 — push + PR |
| CI not green | Step 10 — CI + Greptile |
| All done | Step 11 — guard pre-report → Step 12 — report |
