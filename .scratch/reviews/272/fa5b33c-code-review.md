# Code Review — Issue #272 (bodyLimit middleware)

Fixed point: `git diff 9aac620...HEAD` (merge-base). Executed inline along both axes
because sub-agent spawning is unavailable.

## Standards axis

Sources: `AGENTS.md`, `docs/engineering-workflow.md`, `apps/api/eslint.config.mjs`,
`tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), and the
Fowler smell baseline.

- Naming is clear: `resolveBodyLimitMaxSize`, `MAX_JSON_BODY_BYTES`,
  `MAX_MULTIPART_BODY_BYTES`, `bodyLimitMiddleware` — no Mysterious Name.
- No Duplicated Code: the cap-selection logic lives in one function used by the middleware
  and the tests.
- No Feature Envy / Message Chains / Middle Man: the middleware is a thin seam over
  hono's `bodyLimit` with the content-type→maxSize mapping as the module's own logic.
- No Data Clumps / Primitive Obsession: two exported constants carry the domain numbers;
  the content-type→limit mapping is a small pure function.
- No Speculative Generality: no config injection, no factory params — just the two caps the
  issue specifies.
- ESM-only style (`verbatimModuleSyntax`): `import { bodyLimit } from "hono/body-limit"` is
  correct; no `import type` misuse.
- Lint + typecheck both clean (`pnpm lint`, `pnpm typecheck`).

One note: the test-only `streamRequestInit` cast exists because TS DOM `RequestInit`
doesn't include `duplex`; scoped to tests, production code has no casts. Acceptable.

## Spec axis

Source: issue #272 body.

1. "Add `bodyLimit` middleware at the app level (~1 MB JSON / 30 MB multipart)" → done:
   `app.use("*", bodyLimitMiddleware)` registered globally in `createApp`; caps are
   content-type-aware (1 MB non-multipart / 30 MB multipart). ✅
2. "Check `Content-Length` before parsing multipart" → done: hono `bodyLimit`
   short-circuits on `content-length` > cap before any body read; proven by tests
   asserting the route handler and `getCurrentSessionUser` are never invoked. ✅
3. "Keep per-file + total caps as defense in depth" → preserved: the route-level
   `MAX_INVOICE_ATTACHMENT_COUNT` (10) and `MAX_INVOICE_ATTACHMENT_TOTAL_SIZE` (25 MB)
   checks remain untouched; the middleware is a transport backstop. ✅
4. No scope creep: no changes outside `apps/api/src/middleware/*` + the single
   `create-app.ts` wiring + tests.

## Verdict

Standards: 0 findings. Spec: all requirements implemented, no extra behavior.
No actionable findings.
