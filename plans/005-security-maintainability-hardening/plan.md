# Plan 005 — Security, Maintainability, and Scalability Hardening

**Date:** 2026-04-13  
**Status:** Active  
**Priority:** Critical  
**Scope:** Security boundary hardening, storage safety, maintainability cleanup, and scalability preparation after audit baseline commit `6b72c64`

---

## Overview

This plan captures the post-audit hardening work that should be executed in a deterministic order.

It is designed so that another model or engineer can continue from the same baseline and produce the same result with minimal ambiguity.

The current baseline already includes:

1. safer local Vite binding
2. direct dependency refresh for the most obvious security-sensitive packages
3. invoice attachment count and total-size guardrails
4. green `lint`, `typecheck`, `test`, and `build`

The remaining high-value work is:

1. remove or reduce renderer access to desktop auth secrets
2. move invoice attachments into private app data instead of `process.cwd()`
3. reduce maintainability risk from oversized modules and prototype residue
4. reduce scalability risk from workspace-wide snapshot fetching and broad invalidation

---

## Baseline Requirements

All phases in this plan must preserve the following:

1. `pnpm lint` passes
2. `pnpm typecheck` passes
3. `pnpm test` passes
4. `pnpm build` passes
5. no secret values are introduced into tracked files
6. no push to remote unless explicitly requested

If a phase cannot satisfy all six conditions, stop and document the blocker instead of guessing.

---

## Execution Rules

### Rule 1 — Change order matters

Implement the phases in the order below unless a clear blocker forces reordering.

### Rule 2 — Prefer narrow refactors

Each phase should leave the repo in a releasable state. Avoid mixing security boundary work with large domain restructuring in the same commit.

### Rule 3 — Keep behavior stable

If a refactor changes architecture, preserve the existing user-visible behavior unless the plan explicitly says to change it.

### Rule 4 — Add guardrails before deep rewrites

If a risky area has no tests, add targeted tests before or during the refactor.

### Rule 5 — Do not silently weaken security

If a phase cannot fully remove a risk, reduce the risk and clearly document the remaining gap.

---

## Phase Order

1. **Phase 1 — Storage and runtime hardening**
2. **Phase 2 — Desktop auth boundary hardening**
3. **Phase 3 — Maintainability decomposition**
4. **Phase 4 — Workspace query segmentation**
5. **Phase 5 — Bundle and route modularization**

The current execution target is **Phase 1**.

---

## Phase 1 — Storage and Runtime Hardening

### Problem

Invoice attachments are currently stored under:

- `apps/api/src/modules/inventory/inventory.storage.ts`
- `resolve(process.cwd(), "data", "attachments", "invoices")`

That is unsafe for packaged desktop runtime because the effective working directory is not the same thing as private application storage.

### Why this phase is first

1. It is high-value and low-risk.
2. It improves security immediately.
3. It does not require rewriting auth architecture.
4. It establishes a clean pattern for environment-derived private paths.

### Target outcome

Attachments must resolve from a private runtime-aware root path.

### Required implementation decisions

Use this exact decision tree:

1. If `APP_ATTACHMENTS_ROOT` is defined, use it.
2. Else if `APP_DB_PATH` or `AUTH_DB_PATH` is defined, derive the attachment root from that private runtime data area.
3. Else fall back to local development path under `process.cwd()/data/attachments/invoices`.

### Files to inspect and update

1. `apps/api/src/infrastructure/config/database-env.ts`
2. `apps/api/src/infrastructure/config/env.ts`
3. `apps/api/src/app/dependencies.ts`
4. `apps/api/src/modules/inventory/inventory.storage.ts`
5. `apps/desktop/src-tauri/src/lib.rs`
6. any related config or tests

### Ordered tasks

1. Extend API env resolution to expose an `attachmentsRootPath`.
2. Prefer `APP_ATTACHMENTS_ROOT` when present.
3. Otherwise derive a stable root from the resolved runtime database path.
4. Refactor `InventoryAttachmentStorage` to accept the root path as a constructor argument instead of hardcoding `process.cwd()`.
5. Wire the resolved root path through `appDependencies`.
6. In Tauri, pass a dedicated `APP_ATTACHMENTS_ROOT` environment variable when spawning the API process.
7. Add or update tests for env resolution if coverage is missing.
8. Re-run full validation.

### Validation

Run:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`

### Done criteria

This phase is done only when:

1. attachment storage no longer depends on `process.cwd()` in packaged desktop operation
2. the storage path is injectable and testable
3. the workspace remains green

---

## Phase 2 — Desktop Auth Boundary Hardening

### Problem

The renderer can currently retrieve raw desktop auth tokens from native state or secure storage through Tauri commands.

Affected areas include:

1. `apps/desktop/src-tauri/src/lib.rs`
2. `apps/web/src/lib/desktop-auth-session.ts`
3. `apps/web/src/lib/auth-api.ts`
4. `apps/web/src/lib/orpc-client.ts`

### Why this is not phase 1

This is the highest-severity remaining risk, but it is also more invasive because current desktop API calls depend on a bearer token being available in the renderer.

### Final target outcome

Raw auth tokens should not be retrievable by renderer code.

### Required architecture target

Move toward a native-authenticated request boundary.

The desired end state is:

1. token stays in Tauri native state and/or keyring only
2. renderer requests authenticated data through a safe bridge or proxy
3. renderer never receives the raw token string after hydration

### Acceptable implementation path

Execute in subphases:

#### Phase 2A — Surface reduction

Goal: reduce direct secret retrieval where possible without breaking the app.

Tasks:

1. inventory all native commands related to auth session/token access
2. document which commands are required for compatibility and which are removable now
3. remove any unused getter commands immediately
4. replace secret-returning getters with metadata-only equivalents where possible
5. update tests accordingly

#### Phase 2B — Native authenticated request bridge

Goal: remove the need for renderer-built `Authorization` headers.

Tasks:

1. define a Tauri command that performs authenticated HTTP requests natively against the sidecar API
2. support at minimum:
   - method
   - path/url
   - headers allowlist
   - body
3. keep request scope narrow; do not expose arbitrary localhost access
4. adapt desktop auth API calls and RPC transport to use the native bridge in desktop mode
5. remove renderer token hydration once desktop mode no longer needs it

#### Phase 2C — Cleanup

1. remove obsolete token getter commands
2. remove no-longer-needed token header helpers from web runtime
3. re-run full tests and add regression coverage

### Validation

At minimum, cover:

1. desktop sign-in
2. desktop sign-out
3. authenticated RPC requests in desktop mode
4. password change with token rotation or equivalent session refresh
5. browser mode remains unchanged

### Done criteria

This phase is done only when renderer code cannot directly obtain the persisted desktop bearer token.

---

## Phase 3 — Maintainability Decomposition

### Problem

The following files are too large and mix multiple concerns:

1. `apps/api/src/modules/company/company.service.ts`
2. `apps/api/src/modules/company/company.repository.ts`
3. `packages/contracts/src/index.ts`
4. `apps/web/src/features/app-shell/mock-dashboard.ts`

### Target outcome

Split these into smaller domain-centered modules without changing behavior.

### Required domain split

Use this target shape:

1. `company/workforce`
2. `company/projects`
3. `company/warehouses`
4. `company/debts`
5. `company/audit`
6. `contracts/company/*`
7. `contracts/debts/*`
8. `contracts/inventory/*`

### Ordered tasks

1. break `packages/contracts/src/index.ts` into feature modules first
2. re-export through a barrel to preserve imports
3. extract repository helpers from `company.repository.ts`
4. extract service methods by domain from `company.service.ts`
5. split `mock-dashboard.ts` into feature-local query and mutation modules
6. keep each extraction behavior-preserving

### Validation

1. no public contract import paths should break unless intentionally updated everywhere
2. tests must remain green after each extraction slice

---

## Phase 4 — Workspace Query Segmentation

### Problem

The app is too dependent on full workspace snapshot fetching and broad cache invalidation.

### Target outcome

Replace the single large snapshot pattern with feature-scoped queries.

### Required query targets

Introduce discrete query families for:

1. employees
2. projects
3. warehouses
4. debts summary
5. debts detail
6. system log list
7. inventory lists and detail

### Ordered tasks

1. map all current consumers of the workspace snapshot
2. identify the minimal query shape each screen actually needs
3. add new contracts and API handlers feature by feature
4. migrate web hooks and invalidation keys per feature
5. remove whole-workspace invalidation where feature-scoped invalidation is enough

### Validation

1. no screen should regress functionally
2. query keys should become more specific
3. mutation invalidations should affect only the relevant domains when possible

---

## Phase 5 — Bundle and Route Modularization

### Problem

The web build already reports oversized chunks, especially in the router bundle.

### Target outcome

Introduce route-level and feature-level code splitting.

### Ordered tasks

1. identify the heaviest route entry points
2. lazy-load large route components where safe
3. split heavy feature modules from the default shell path
4. add manual chunking only if lazy loading alone is insufficient
5. keep bundle analysis notes in the plan or PR summary

### Validation

1. `pnpm build` still passes
2. main router chunk size drops materially
3. navigation still works in browser and desktop runtime

---

## Testing Strategy

For every phase:

1. run the smallest relevant test first
2. then run full `pnpm typecheck`
3. then run full `pnpm test`
4. then run full `pnpm build`

If a phase changes runtime or auth behavior, also add or update focused unit tests before relying on manual verification.

---

## Commit Strategy

Use separate local commits for each major phase:

1. storage/runtime hardening
2. desktop auth boundary hardening
3. maintainability decomposition slices
4. query segmentation slices
5. bundle modularization

Do not combine unrelated phases into one commit.

---

## Immediate Next Action

Start with **Phase 1 — Storage and Runtime Hardening**.

Concretely, the next implementation should:

1. make attachment storage root configurable
2. wire that root from env/runtime paths
3. preserve current local dev behavior
4. validate the full workspace
