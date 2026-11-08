---
name: feature-implement
description: "Mandatory lifecycle for code changes. Coordinates committed source, affected local proof, bounded reviews and CI-final acceptance; workers stop at a local handoff."
---

# Feature implementation

Read `docs/engineering-workflow.md` first. It is the policy authority.
Read `.agents/wisdom/README.md`, then matching lessons. Use the supplied
verification mode; ask the parent if it was omitted.

## 1. Pin the work

Confirm the absolute worktree, clean/dirty state, spec, target and base SHA.
Normally fetch `origin/develop`; in owner-requested local-only mode use the
declared cached base and do not fetch or publish. Record the review tier and
named reachable risk in `.scratch/implementation/<scope>-design.md`.

## 2. Implement and prove affected behavior

Use `tdd` or `implement` at real interfaces. Select focused regression and
integration cases for the change and direct callers. Preserve negative proof
for money, stock, auth, crypto and recovery. Load relevant Hono, Tauri,
Playwright or UI skills only when those areas change.

Use `domain-modeling` and `codebase-design` while designing. For UI, load
`impeccable` and inspect the existing rendering before changing it. Keep
keyboard, RTL, relevant states and required visual evidence in scope.

Run `guard` Phase 1. Commit the complete reviewable scope before asking for
review or final rendering. Keep source frozen for independent readers.

## 3. Review once, then bound corrections

Run `debate`, `test-audit`, `code-review` in that order, each in a distinct
read-only session at the committed HEAD. This repository retains all three
initial lenses. Give them the actual worktree, base/head, spec, direct callers
and prior evidence, not an empty fresh checkout.

Use `reviewloop` to record exact-tree executions and finding dispositions.
Verify claims against source. A bounded fix is committed, checked with affected
proof, and inspected by one fresh combined-delta reviewer. Carry unchanged
conclusions forward explicitly; rerun another lens only for new risk.
After three fix rounds, reassess the design.

## 4. Verify the committed head

Run `guard` Phase 2. Local verification is affected-only with relevant lint,
typecheck and generated-file checks. No routine full suites, full browsers,
production builds or audits; those are CI-final. A concrete uncertainty or CI
gap must precede a local expansion. No local red-on-parent replay is required.

When background verification is authorized, use the brief in
`writing-for-agents/delegation-template.md`. Pin commands, scope, mode, SHA
and log directory. It may write ignored evidence, not source. Inspect native
exit codes, counts, duration and the source fingerprint on completion.
Do not poll a live child. Heavy work takes a justified queue slot.

Record checks in `.scratch/reviews/<scope>/<HEAD>-verification.md`, ignored.
Never commit or post review reports, or add an evidence-only commit.

## 5. Hand off

The worker stops with verified HEAD, base, exact local results, review
verdicts, applied wisdom and unresolved blockers. Candidates for repeated
lessons go under `Lesson:` in the commit body. Workers never write wisdom,
push, open a PR or merge.

## Parent-only completion

When authorized, publish and link/watch the PR. Request hosted review once per
head; preserve its missing-verdict gate. Check `CI acceptance` on the current
head separately from local readiness and effective protection. Activation
remains pending until the owner completes `docs/ci-final-activation.md`.

Apply scoped architecture review when a module/interface/seam changed, then
Guard Phase 3. Never restart an unchanged initial review solely because it
was published. Owner-only merge decisions and explicit no-publication
instructions remain binding.
