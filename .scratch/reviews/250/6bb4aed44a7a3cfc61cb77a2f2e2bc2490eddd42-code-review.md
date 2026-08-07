# Code Review — Issue #250 (Coverage 100%: auth + rbac)

- Fixed point: `fd94c413846934e8722aa098f130e3a5bf9db1c6` (origin/develop merge-base)
- Head: `6bb4aed44a7a3cfc61cb77a2f2e2bc2490eddd42`
- Axes: Standards + Spec (parallel reviewer sub-agents, fresh context)
- Commits reviewed: `f8134b4` (coverage include + edge-case pins), `431ef7d` (isPermission exactly-one-colon), `1c479b8` (invisible-name refine + audit pins), `6bb4aed` (per-field custom-issue map — implements the reviewers' own advisory)

## Standards axis

**No hard violations.** Verified against AGENTS.md, docs/engineering-workflow.md, .agents/wisdom/*:

- `auth.ts` name refine is a pure validator (not a transform) — consistent with "Output schemas validate, they don't transform" (wisdom/architecture.md).
- Empty-string guard defers to `.min(1)` → single `too_small` issue — consistent with the zod-issue taxonomy wisdom entry.
- `permissions.ts` exactly-one-colon enforces the documented `resource:action` format; read-time filter claim verified (`sqlite-role.repository.ts:115`).
- `custom`-issue message handling now uses a full `Record<BootstrapInputField, string>` keyed by field (the project's compile-time-enforced map pattern), so a future refine on another field forces a message decision instead of a misleading fallback.
- Advisory only: `\u200B` literal repeated across 4 test files (acceptable behavior pins); resolver pass-through vs repository filter is a documented deliberate divergence (#210).

## Spec axis

**Nothing missing; no scope creep beyond justified hardening.**

- Criterion 1 (include covers auth+rbac) ✔ — auth was already included; `src/modules/rbac/**/*.ts` added.
- Criterion 2 (100% thresholds) ✔ — verified locally: 100% stmts/branches/funcs/lines (268/268, 153/153, 61/61, 239/239).
- Criterion 3 (security edge cases) ✔ — ZWSP/whitespace/format-char inputs (name, phone, recovery keys), unknown/stale/multi-colon permission strings, pass-through pin, copy isolation, empty userId. The isPermission tightening and the bootstrap-name refine are behavior changes justified by criterion 3's explicit "zero-width inputs / unknown permission strings" mandate; the design doc records both as deliberate deviations.
- Criterion 4 (typecheck + test:api + lint green) ✔ — verified locally after every commit.
- #230/#234 (password/key schema hardening) and #210 (session edges) remain OPEN by design — documented in the design doc; not silently dropped.

## Verdict

No actionable findings. Safe to push.
