---
name: guard
description: "Single source of truth for pre-flight checks: pre-commit, pre-push, pre-report. Tier-aware. Evidence-SHA-aware. Called by feature-implement. Do not bypass."
---

# Guard — Pre-flight Checks

Three phases. Each has explicit, checkable completion criteria.
If any check fails, stop and report. Do not proceed.

## Derive repository

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner
```

## Phase 1 — Pre-commit

Run before every commit. Uses the Husky pre-commit hook.

```
[ ] pnpm --filter @tuari/contracts build — compiles?
[ ] pnpm typecheck — passes?
[ ] pnpm lint — 0 errors?
[ ] pnpm test:api — all tests pass?
[ ] pnpm test:web — all tests pass?
```

If the change touches Rust Core (`apps/desktop/src-tauri/src/`):
```
[ ] cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml — passes?
[ ] cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings — clean?
```

## Phase 2 — Pre-push

Run before pushing and opening a PR. Uses the Husky pre-push hook.

```
[ ] pnpm --filter @tuari/contracts build — compiles?
[ ] pnpm typecheck — passes?
[ ] pnpm lint — 0 errors?
[ ] pnpm test:api — all tests pass?
[ ] pnpm test:web — all tests pass?
[ ] git status — working tree clean?
```

### Review evidence checks

For each evidence file `.scratch/reviews/<issue-id>/<sha>-*.md`:
- Extract the SHA from the filename
- Compare to current HEAD (`git rev-parse HEAD`)
- If they match → evidence is valid for the current code
- If they differ → inspect `git diff --name-only <evidence-sha> HEAD`:
  - If any reviewable file changed (apps/, packages/, .github/workflows/,
    .agents/skills/, docs/) → evidence is **STALE**, must regenerate
  - If only non-reviewable files changed (.gitignore, .gitattributes,
    .scratch/, LICENSE) → evidence remains valid

**All Markdown files under `docs/`, `.agents/`, and `.github/` are reviewable.**
Only truly non-reviewable files (.gitignore, .gitattributes, LICENSE, scratch)
get the docs-only exemption.

### Tier-specific requirements

**Lightweight** (genuinely non-reviewable files only):
→ Skip test-audit, debate, and code-review checks.

**Standard** (code, CI, workflow, config):
```
[ ] Test-audit evidence exists and is not stale
[ ] Code-review evidence exists and is not stale
```

**High-assurance** (authz, RBAC, licensing, crypto, debt financials):
```
[ ] Debate evidence exists and is not stale
[ ] Test-audit evidence exists and is not stale
[ ] Code-review evidence exists and is not stale
```

## Phase 3 — Pre-report

Run before reporting "ready for merge".

```
[ ] CI — all checks green on GitHub? (lint, typecheck, test-api, test-web, test-rust, build)
[ ] Greptile — no actionable findings? (check PR comments, not just score)
[ ] PR description — accurate and complete?
[ ] Any deferred items — documented with follow-up issues?
[ ] Wisdom — any lessons to capture?
```

## When a check fails

1. Report to the user what failed and why
2. Do not proceed past the failing check
3. If the user explicitly says "skip it" after being informed of the risk,
   note the waiver and continue.
4. If the user says "fix it", fix it and re-run the check.

**Mandatory gates (never skip):** typecheck, lint, test, CI green,
Greptile inline-comment inspection. These must pass.
