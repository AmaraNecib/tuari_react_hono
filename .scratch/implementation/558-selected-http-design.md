# Selected exact HTTP composition

Worktree: `D:/worktrees/tuari_react_hono/t3-2f17d1bf-c9fbe2a939ec13db`.
Base: `c428d3abb48c86c7e18c206eaada40990900221c`.
Mode: `focused-local / CI-final-pending`. High assurance: authentication, transport and financial ownership.

## Scope

`createApp` now accepts either the unchanged legacy `AppDependencies` or the explicitly discriminated `FreshExactAppDependencies`. Router composition already accepts both and selects the fresh exact graph by its `mode`; no cast to the legacy graph or numeric service construction is added. The default startup in `index.ts` and `createAppDependencies` is untouched.

Selected exact applications explicitly return 503 for invoice attachment upload/download because that root intentionally exposes no attachment service. Legacy applications retain their existing attachment handlers. Shared middleware, ORPC transport, auth/session, CORS, body limits, security headers and error handling remain on the single existing Hono app.

## Boundary and proof

The selected exact root and constructor-level native payroll proof pre-existed this transport seam. This change does not claim HTTP financial scenario coverage, CI acceptance, default activation, review completion, or production readiness. Existing `payroll-startup.integration.test.ts` currently uses direct router clients; a real `app.request()` RPC bridge and comprehensive HTTP scenario remain required before task completion.

## Review and architecture

The interface seam moved at `createApp` only. No schema, finance router, selected-root, workforce, web, or history source was changed. The discriminant prevents selected-root access to legacy attachment capabilities rather than fabricating unavailable behavior.
