# Plan 005 Completion Notes

Status snapshot after the 2026-04-29 work session.

## Phase 1 — Storage and runtime hardening — DONE

- `apps/api/src/infrastructure/config/database-env.ts` resolves `attachmentsRootPath` from `APP_ATTACHMENTS_ROOT`, otherwise from the resolved database path, otherwise the local dev fallback.
- `InventoryAttachmentStorage` accepts the root path through its constructor and is wired through `appDependencies` in `apps/api/src/app/dependencies.ts`.
- `apps/desktop/src-tauri/src/lib.rs` resolves `attachments_root` next to the runtime database and sets `APP_ATTACHMENTS_ROOT` on the spawned API process.
- `apps/api/src/modules/inventory/inventory.storage.test.ts` covers root-relative read/write and traversal rejection.

## Phase 2 — Desktop auth boundary hardening — DONE

- Tokens stay in native Rust state; the renderer no longer holds raw bearer tokens.
- `desktop_api_request`, `desktop_sign_in_with_phone_number`, `desktop_change_password`, `desktop_sign_out_session` are the only renderer-callable auth/RPC commands. Renderer-supplied `authorization`, `cookie`, `host`, `origin`, and `content-length` headers are rejected.
- Web side uses `desktopApiFetch` from `apps/web/src/lib/desktop-api-bridge.ts` for both auth API calls and the oRPC transport when running in Tauri.
- Boundary documented in `docs/desktop-auth-boundary.md`.

## Phase 3 — Maintainability decomposition — PARTIAL

- `apps/web/src/features/app-shell/mock-dashboard.ts` is now a 43-line barrel re-exporting from `workspace-queries.ts` and `workspace-mutations.ts`. The previous ~800-line monolith is gone.
- `apps/api/src/modules/company/company.service.ts` (~1.7k lines), `apps/api/src/modules/company/company.repository.ts` (~1.7k lines), and `packages/contracts/src/index.ts` (~1.3k lines) are still monolithic and should be split into the domain modules listed in the plan (workforce, projects, warehouses, debts, audit; contracts/company, contracts/debts, contracts/inventory). Deferred — behavior-preserving splits at this scale are a multi-PR effort and were not safe to attempt under the same change set as the security/hardening work.

## Phase 4 — Workspace query segmentation — PARTIAL

- `workspace-queries.ts` introduces a `workspaceDomainQueryKeys` map for `employees`, `projects`, `warehouses`, `debtsSummary`, `debtsDetail`, `inventory`, `systemLog`. `useSystemLogQuery` already runs as a feature-scoped query.
- `useDemoWorkspaceQuery` still pulls the full snapshot, and most mutations invalidate via the broad `demoWorkspaceQueryKey`. The remaining migration is to point each consumer at its narrow domain query and shrink the snapshot fetch. Deferred for the same reason as Phase 3 — this is a feature-by-feature migration.

## Phase 5 — Bundle and route modularization — DONE

- `apps/web/src/router.tsx` lazy-loads `HomeView`.
- `apps/web/src/features/app-shell/home-view-page-content-detail-pages.tsx` lazy-loads heavy detail, invoice, inventory, debts, and edit/create pages.
- `pnpm build` reports the largest router chunk at ~187 kB (gzip ~60 kB) with detail pages split into per-route bundles.

## Validation

- `pnpm typecheck` — green
- `pnpm lint` — green
- `pnpm test` — green (109 API, 108 web)
- `pnpm build` — green
